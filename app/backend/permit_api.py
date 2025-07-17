"""
Building Permit Application API endpoints
"""
import io
import json
import logging
import os
import re
import time
import uuid
from datetime import datetime
from typing import Any, Optional, Union

from docx import Document
from quart import Blueprint, current_app, jsonify, request, send_file
from azure.cosmos import exceptions
from azure.cosmos.aio import ContainerProxy, CosmosClient
from azure.identity.aio import AzureDeveloperCliCredential, ManagedIdentityCredential

from decorators import authenticated
from error import error_response
from config import (
    CONFIG_CREDENTIAL,
    CONFIG_PERMIT_APPLICATIONS_COSMOS_ENABLED,
    CONFIG_COSMOS_PERMIT_CLIENT,
    CONFIG_COSMOS_PERMIT_CONTAINER
)

# Create a blueprint for permit-related endpoints
permit_bp = Blueprint("permit", __name__, url_prefix="/api/permit")

class PermitApplicationService:
    """Service class for managing permit applications with Cosmos DB integration"""
    
    def __init__(self):
        # Tradesman database for demo purposes
        self.tradesman_database = {
            "T001": {
                "id": "T001",
                "name": "John Smith",
                "contactNumber": "403-555-0123",
                "email": "john.smith@electriccalgary.com",
                "isValidated": True,
                "licenseNumber": "EL-2024-001",
                "licenseExpiryDate": "2025-12-31",
                "specializations": ["Residential", "Commercial"]
            },
            "T002": {
                "id": "T002",
                "name": "Sarah Johnson",
                "contactNumber": "403-555-0456",
                "email": "sarah.johnson@powerpro.ca",
                "isValidated": True,
                "licenseNumber": "EL-2024-002",
                "licenseExpiryDate": "2025-11-30",
                "specializations": ["Industrial", "Commercial"]
            }
        }
        
        # Sample fees structure
        self.base_fees = {
            "electrical_permit": {
                "base_fee": 112.00,
                "permit_fee": 19.58,
                "scc_surcharge": 5.26
            }
        }
    
    def _get_cosmos_container(self) -> Optional[ContainerProxy]:
        """Get the Cosmos DB container for permit applications"""
        try:
            if not current_app.config.get(CONFIG_PERMIT_APPLICATIONS_COSMOS_ENABLED):
                return None
            return current_app.config.get(CONFIG_COSMOS_PERMIT_CONTAINER)
        except Exception as e:
            logging.error(f"Error getting Cosmos container: {str(e)}")
            return None
    
    def generate_permit_number(self) -> str:
        """Generate a unique permit number"""
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        random_part = str(uuid.uuid4())[:8].upper()
        return f"PE{timestamp}{random_part}"
    
    def validate_address(self, address: str) -> dict[str, Any]:
        """Validate a Calgary address"""
        # In a real implementation, this would integrate with Calgary's address validation service
        # For demo purposes, we'll do basic validation
        if not address or len(address.strip()) < 10:
            return {"isValid": False, "error": "Address too short"}
        
        # Simple validation - check if it contains Calgary-like patterns
        calgary_keywords = ["Calgary", "AB", "Alberta", "T1", "T2", "T3"]
        address_upper = address.upper()
        
        has_calgary_keyword = any(keyword.upper() in address_upper for keyword in calgary_keywords)
        
        if has_calgary_keyword:
            return {
                "isValid": True,
                "formattedAddress": address.strip(),
                "suggestions": []
            }
        else:
            return {
                "isValid": False,
                "error": "Address must be within Calgary, AB",
                "suggestions": [
                    "123 Main Street SW, Calgary, AB T2P 1H9",
                    "456 Centre Street NE, Calgary, AB T2E 2T4"
                ]
            }
    
    def get_tradesman_data(self, tradesman_id: str) -> Optional[dict[str, Any]]:
        """Get tradesman data from the database"""
        return self.tradesman_database.get(tradesman_id)
    
    def calculate_permit_fees(self, permit_type: str, total_job_cost: float) -> list[dict[str, Any]]:
        """Calculate permit fees based on permit type and job cost"""
        fees = []
        today = datetime.now().strftime("%Y-%m-%d")
        
        if permit_type in self.base_fees:
            fee_structure = self.base_fees[permit_type]
            
            # Base fee
            fees.append({
                "date": today,
                "description": "Base Fee",
                "amount": fee_structure["base_fee"],
                "taxAmount": 0,
                "isPaid": False
            })
            
            # Permit fee
            fees.append({
                "date": today,
                "description": "Permit Fee",
                "amount": fee_structure["permit_fee"],
                "taxAmount": 0,
                "isPaid": False
            })
            
            # SCC Surcharge
            fees.append({
                "date": today,
                "description": "SCC Surcharge",
                "amount": fee_structure["scc_surcharge"],
                "taxAmount": 0,
                "isPaid": False
            })
            
            # Additional fees based on job cost
            if total_job_cost > 10000:
                fees.append({
                    "date": today,
                    "description": "High Value Job Surcharge",
                    "amount": total_job_cost * 0.001,  # 0.1% of job cost
                    "taxAmount": 0,
                    "isPaid": False
                })
        
        return fees
    
    async def create_permit_application(self, permit_data: dict[str, Any], user_id: str) -> dict[str, Any]:
        """Create a new permit application and save to Cosmos DB"""
        try:
            logging.info("=== BACKEND: Creating permit application ===")
            logging.info(f"User ID: {user_id}")
            logging.info(f"Input permit data: {permit_data}")
            
            # Generate permit number if not provided
            if not permit_data.get("permitNumber"):
                permit_data["permitNumber"] = self.generate_permit_number()
            
            logging.info(f"Generated permit number: {permit_data['permitNumber']}")
            
            # Add system fields
            permit_data["id"] = permit_data["permitNumber"]  # Use permit number as document ID
            permit_data["user_id"] = user_id  # Partition key
            permit_data["type"] = "permit_application"  # Document type for queries
            permit_data["createdDate"] = datetime.now().isoformat()
            permit_data["lastModifiedDate"] = datetime.now().isoformat()
            permit_data["createdBy"] = user_id
            permit_data["lastModifiedBy"] = user_id
            permit_data["timestamp"] = int(time.time() * 1000)
            
            # Calculate fees
            permit_fees = self.calculate_permit_fees(
                permit_data.get("permitType", "electrical_permit"),
                permit_data.get("totalJobCost", 0)
            )
            permit_data["permitFees"] = permit_fees
            
            # Add initial permit activity
            permit_data["permitActivities"] = [{
                "id": str(uuid.uuid4()),
                "type": "created",
                "createdDate": datetime.now().isoformat(),
                "description": "Permit application created",
                "performedBy": user_id
            }]
            
            # Initialize empty arrays if not provided
            if "inspectionActivities" not in permit_data:
                permit_data["inspectionActivities"] = []
            if "documents" not in permit_data:
                permit_data["documents"] = []
            
            logging.info(f"Final permit data before save: {permit_data}")
            
            # Try to save to Cosmos DB, fallback to in-memory if not available
            container = self._get_cosmos_container()
            logging.info(f"Cosmos container available: {container is not None}")
            
            if container:
                try:
                    logging.info("Attempting to save to Cosmos DB...")
                    # Use upsert to handle both create and update scenarios
                    await container.upsert_item(permit_data)
                    logging.info(f"SUCCESS: Permit application {permit_data['permitNumber']} saved to Cosmos DB")
                except exceptions.CosmosHttpResponseError as e:
                    logging.error(f"COSMOS ERROR: Failed to save permit application to Cosmos DB: {str(e)}")
                    # Return success with warning - data is still in memory for this request
                    return {
                        "success": True,
                        "message": "Permit application created successfully (database unavailable)",
                        "permitApplication": permit_data,
                        "permitNumber": permit_data["permitNumber"]
                    }
            else:
                logging.warning("Cosmos DB not available, permit application saved in memory only")
            
            return {
                "success": True,
                "message": "Permit application created successfully",
                "permitApplication": permit_data,
                "permitNumber": permit_data["permitNumber"]
            }
            
        except Exception as e:
            logging.error(f"Error creating permit application: {str(e)}")
            return {
                "success": False,
                "message": f"Failed to create permit application: {str(e)}"
            }
    
    async def get_permit_application(self, permit_number: str, user_id: str = None) -> Optional[dict[str, Any]]:
        """Get a permit application by permit number from Cosmos DB"""
        try:
            container = self._get_cosmos_container()
            if container and user_id:
                try:
                    # Query by permit number (document id) and user_id (partition key)
                    item = await container.read_item(
                        item=permit_number,
                        partition_key=user_id
                    )
                    return item
                except exceptions.CosmosResourceNotFoundError:
                    logging.info(f"Permit application {permit_number} not found in Cosmos DB")
                    return None
                except exceptions.CosmosHttpResponseError as e:
                    logging.error(f"Failed to retrieve permit application from Cosmos DB: {str(e)}")
                    return None
            else:
                logging.warning("Cosmos DB not available for permit retrieval")
                return None
        except Exception as e:
            logging.error(f"Error getting permit application: {str(e)}")
            return None
    
    async def update_permit_application(self, permit_data: dict[str, Any], user_id: str) -> dict[str, Any]:
        """Update an existing permit application in Cosmos DB"""
        try:
            permit_number = permit_data.get("permitNumber")
            if not permit_number:
                return {
                    "success": False,
                    "message": "Permit number is required for updates"
                }
            
            # Update system fields
            permit_data["lastModifiedDate"] = datetime.now().isoformat()
            permit_data["lastModifiedBy"] = user_id
            permit_data["user_id"] = user_id  # Ensure partition key is set
            permit_data["id"] = permit_number  # Ensure document ID is set
            permit_data["type"] = "permit_application"
            
            # Try to get existing application first to preserve existing activities
            existing_app = await self.get_permit_application(permit_number, user_id)
            if existing_app:
                permit_data["permitActivities"] = existing_app.get("permitActivities", [])
            else:
                permit_data["permitActivities"] = []
            
            permit_data["permitActivities"].append({
                "id": str(uuid.uuid4()),
                "type": "modified",
                "createdDate": datetime.now().isoformat(),
                "description": "Permit application updated",
                "performedBy": user_id
            })
            
            # Try to save to Cosmos DB
            container = self._get_cosmos_container()
            if container:
                try:
                    await container.upsert_item(permit_data)
                    logging.info(f"Permit application {permit_number} updated in Cosmos DB")
                except exceptions.CosmosHttpResponseError as e:
                    logging.error(f"Failed to update permit application in Cosmos DB: {str(e)}")
                    return {
                        "success": False,
                        "message": f"Failed to update permit application: {str(e)}"
                    }
            else:
                logging.warning("Cosmos DB not available for permit update")
                return {
                    "success": False,
                    "message": "Database unavailable for updates"
                }
            
            return {
                "success": True,
                "message": "Permit application updated successfully",
                "permitApplication": permit_data
            }
            
        except Exception as e:
            logging.error(f"Error updating permit application: {str(e)}")
            return {
                "success": False,
                "message": f"Failed to update permit application: {str(e)}"
            }
    
    async def get_auto_fill_data_for_field(self, field_name: str, auth_claims: dict[str, Any], session_id: str = None) -> str:
        """Get auto-fill data for a specific field based on field name from Cosmos DB metadata"""
        user_name = auth_claims.get("name", "")
        user_email = auth_claims.get("email", "")
        user_id = auth_claims.get("oid", "")
        
        # First try to get data from Cosmos DB metadata
        try:
            from azure.cosmos import exceptions, CosmosClient
            from quart import current_app
            from config import (
                CONFIG_COSMOS_PERMIT_CLIENT,
                CONFIG_COSMOS_PERMIT_CONTAINER,
                CONFIG_PERMIT_APPLICATIONS_COSMOS_ENABLED,
            )
            
            if current_app.config[CONFIG_PERMIT_APPLICATIONS_COSMOS_ENABLED]:
                cosmos_client: CosmosClient = current_app.config[CONFIG_COSMOS_PERMIT_CLIENT]
                container = current_app.config[CONFIG_COSMOS_PERMIT_CONTAINER]
                
                if container:
                    # Use provided session_id or default hardcoded one
                    actual_session_id = "123456789"
                    actual_user_id = "abcdef"  # This should be actual user_id in production
                    
                    try:
                        # Try to read the specific session
                        existing_item = await container.read_item(
                            item=actual_session_id,
                            partition_key="PE123456789"
                        )
                        
                        if existing_item and "metadata" in existing_item:
                            metadata = existing_item["metadata"]
                            print(f"Found metadata in Cosmos DB: {metadata}")
                            
                            # Map field names to metadata keys
                            field_mapping = {
                                "jobDescription": "Job Description",
                                "specificLocation": "Specific Location Info", 
                                "jobAddress": "Job Address",
                                "jobName": "Job Name",
                                "applicantName": "Applicants",
                                "applicantEmail": "Applicant Email",
                                "requestDate": "Request Date",
                                "categoryOfWork": "Category of Work",
                                "typeOfWork": "Type of work",
                                "electricalService": "Electrical Service",
                                "serviceType": "Service Type",
                                "phase": "Phase",
                                "wire": "Wire",
                                "volts": "Volts", 
                                "amps": "Amps",
                                "totalJobCost": "Total Job Cost",
                                "applicationCategories": "Application Categories",
                                "relocatableStructureNumber": "Relocatable Structure Number",
                                "relatedBuildingPermitNumber": "Related Building Permit Number",
                                "onsiteContactName": "On-site contact name",
                                "contactPhoneNumber": "Contact phone number",
                                "contactEmail": "Contact Email",
                                "contactInformation": "Contact Information",
                                "undergroundConductor": "Underground Conductor 1/0 or Larger"
                            }
                            
                            # Get the mapped field name

                            if 'Description' in field_name:
                                field_name = 'jobDescription'
                            if 'Location' in field_name:
                                field_name = 'specificLocation'
                            if 'Email' in field_name:
                                field_name = 'contactEmail'
                                
                            #     metadata_key = field_mapping.get(field_name)
                            #     print(f"Looking for field '{field_name}' mapped to key '{metadata_key}'")
                            
                            #     if metadata_key and metadata_key in metadata:
                            #         cosmos_value = metadata[metadata_key]["Contact Email"]
                            #         if cosmos_value and str(cosmos_value).strip():
                            #             print(f"Found {field_name} in Cosmos DB metadata: {cosmos_value}")
                            #             return str(cosmos_value)
                            #         else:
                            #             print(f"Empty value found for {field_name} in metadata")
                            #     else:
                            #         print(f"Key '{metadata_key}' not found in metadata. Available keys: {list(metadata.keys())}")

                            metadata_key = field_mapping.get(field_name)
                            metadata_key = field_name
                            print(f"Looking for field '{field_name}' mapped to key '{metadata_key}'")
                            
                            if metadata_key and metadata_key in metadata:
                                cosmos_value = metadata[metadata_key]
                                if cosmos_value and str(cosmos_value).strip():
                                    print(f"Found {field_name} in Cosmos DB metadata: {cosmos_value}")
                                    return str(cosmos_value)
                                else:
                                    if 'Email' in field_name:
                                        field_name = 'applicantEmail'
                                        cosmos_value = metadata['applicantEmail']
                                        return str(cosmos_value)
                                    print(f"Empty value found for {field_name} in metadata")
                            else:
                                print(f"Key '{metadata_key}' not found in metadata. Available keys: {list(metadata.keys())}")
                    
                    except exceptions.CosmosResourceNotFoundError:
                        print(f"No metadata found in Cosmos DB for session {actual_session_id}")
                    except Exception as e:
                        print(f"Error reading from Cosmos DB: {str(e)}")
                else:
                    print("Cosmos DB container not available")
            else:
                print("Cosmos DB is not enabled for permit applications")
        
        except Exception as e:
            print(f"Error accessing Cosmos DB: {str(e)}")
        
        # Fallback to sample data if Cosmos DB data not available
        print(f"Using fallback data for field: {field_name}")
        auto_fill_data = {
            # Applicant Information
            "applicantName": user_name,
            "applicantEmail": user_email,
            "applicantPhone": "",  # Would typically come from user profile
            
            # Job Information
            "jobAddress": "",  # Could come from user's recent addresses or favorites
            "jobName": "Electrical Installation Project",
            "jobDescription": "Installation of new electrical service panel, wiring for kitchen renovation including new outlets, GFCI protection, and lighting circuits. Work includes panel upgrade from 100A to 200A service.",
            "specificLocation": "Main floor kitchen area, basement electrical panel room, and connecting circuits throughout main floor",
            
            # Electrical Details
            "electricalService": "Standard Service",
            "wire": "Copper",
            "volts": "120/240",
            "amps": "100",
            "phase": "1",
            
            # Additional Information  
            "applicationCategories": "Electrical",
            "totalJobCost": "5000",
            
            # Contact Information
            "onsiteContactName": user_name,
            "contactPhoneNumber": "",
            "contactEmail": user_email,
            "cqtContactNumber": "",
            "cqtEmailAddress": user_email,
            
            # Work Categories (return default selections)
            "categoryOfWork": "residential",
            "typeOfWork": "improvement", 
            "serviceType": "main",
            "undergroundConductor": "false",
            
            # System generated fields
            "requestDate": datetime.now().strftime("%Y-%m-%d"),
        }
        
        # Return the value for the requested field, or empty string if not found
        return auto_fill_data.get(field_name, "")
    
    def generate_word_document(self, permit_data: dict[str, Any]) -> io.BytesIO:
        """Generate a Word document for the permit application"""
        doc = Document()
        
        # Add title
        title = doc.add_heading('Calgary Building Permit Application', 0)
        title.alignment = 1  # Center alignment
        
        # Add permit information
        doc.add_heading('Permit Information', level=1)
        permit_info = doc.add_paragraph()
        permit_info.add_run(f"Permit Number: ").bold = True
        permit_info.add_run(f"{permit_data.get('permitNumber', 'N/A')}\n")
        permit_info.add_run(f"Status: ").bold = True
        permit_info.add_run(f"{permit_data.get('permitStatus', 'N/A')}\n")
        permit_info.add_run(f"Type: ").bold = True
        permit_info.add_run(f"{permit_data.get('permitType', 'N/A')}\n")
        permit_info.add_run(f"Request Date: ").bold = True
        permit_info.add_run(f"{permit_data.get('requestDate', 'N/A')}\n")
        
        # Add applicant information
        doc.add_heading('Applicant Information', level=1)
        applicant_info = doc.add_paragraph()
        applicant_info.add_run(f"Name: ").bold = True
        applicant_info.add_run(f"{permit_data.get('applicantName', 'N/A')}\n")
        applicant_info.add_run(f"Email: ").bold = True
        applicant_info.add_run(f"{permit_data.get('applicantEmail', 'N/A')}\n")
        applicant_info.add_run(f"Phone: ").bold = True
        applicant_info.add_run(f"{permit_data.get('applicantPhone', 'N/A')}\n")
        
        # Add job information
        doc.add_heading('Job Information', level=1)
        job_info = doc.add_paragraph()
        job_info.add_run(f"Address: ").bold = True
        job_info.add_run(f"{permit_data.get('jobAddress', 'N/A')}\n")
        job_info.add_run(f"Job Name: ").bold = True
        job_info.add_run(f"{permit_data.get('jobName', 'N/A')}\n")
        job_info.add_run(f"Job Number: ").bold = True
        job_info.add_run(f"{permit_data.get('jobNumber', 'N/A')}\n")
        job_info.add_run(f"Description: ").bold = True
        job_info.add_run(f"{permit_data.get('jobDescription', 'N/A')}\n")
        job_info.add_run(f"Specific Location: ").bold = True
        job_info.add_run(f"{permit_data.get('specificLocation', 'N/A')}\n")
        
        # Add work category
        doc.add_heading('Work Category', level=1)
        work_info = doc.add_paragraph()
        work_info.add_run(f"Category of Work: ").bold = True
        work_info.add_run(f"{permit_data.get('categoryOfWork', 'N/A')}\n")
        work_info.add_run(f"Type of Work: ").bold = True
        work_info.add_run(f"{permit_data.get('typeOfWork', 'N/A')}\n")
        
        # Add electrical details
        doc.add_heading('Electrical Details', level=1)
        electrical_info = doc.add_paragraph()
        electrical_info.add_run(f"Service Type: ").bold = True
        electrical_info.add_run(f"{permit_data.get('serviceType', 'N/A')}\n")
        electrical_info.add_run(f"Phase: ").bold = True
        electrical_info.add_run(f"{permit_data.get('phase', 'N/A')}\n")
        electrical_info.add_run(f"Wire: ").bold = True
        electrical_info.add_run(f"{permit_data.get('wire', 'N/A')}\n")
        electrical_info.add_run(f"Volts: ").bold = True
        electrical_info.add_run(f"{permit_data.get('volts', 'N/A')}\n")
        electrical_info.add_run(f"Amps: ").bold = True
        electrical_info.add_run(f"{permit_data.get('amps', 'N/A')}\n")
        electrical_info.add_run(f"Underground Conductor: ").bold = True
        electrical_info.add_run(f"{'Yes' if permit_data.get('undergroundConductor', False) else 'No'}\n")
        
        # Add contact information
        doc.add_heading('Contact Information', level=1)
        contact_info = doc.add_paragraph()
        contact_info.add_run(f"Qualified Tradesman ID: ").bold = True
        contact_info.add_run(f"{permit_data.get('qualifiedTradesmanId', 'N/A')}\n")
        contact_info.add_run(f"Qualified Tradesman Name: ").bold = True
        contact_info.add_run(f"{permit_data.get('qualifiedTradesmanName', 'N/A')}\n")
        contact_info.add_run(f"CQT Contact Number: ").bold = True
        contact_info.add_run(f"{permit_data.get('cqtContactNumber', 'N/A')}\n")
        contact_info.add_run(f"CQT Email: ").bold = True
        contact_info.add_run(f"{permit_data.get('cqtEmailAddress', 'N/A')}\n")
        contact_info.add_run(f"On-site Contact: ").bold = True
        contact_info.add_run(f"{permit_data.get('onsiteContactName', 'N/A')}\n")
        
        # Add permit fees
        doc.add_heading('Permit Fees', level=1)
        fees = permit_data.get('permitFees', [])
        if fees:
            # Create a table for fees
            table = doc.add_table(rows=1, cols=4)
            table.style = 'Table Grid'
            hdr_cells = table.rows[0].cells
            hdr_cells[0].text = 'Date'
            hdr_cells[1].text = 'Description'
            hdr_cells[2].text = 'Amount ($)'
            hdr_cells[3].text = 'Tax ($)'
            
            total_amount = 0
            for fee in fees:
                row_cells = table.add_row().cells
                row_cells[0].text = str(fee.get('date', ''))
                row_cells[1].text = str(fee.get('description', ''))
                row_cells[2].text = f"${fee.get('amount', 0):.2f}"
                row_cells[3].text = f"${fee.get('taxAmount', 0):.2f}"
                total_amount += fee.get('amount', 0) + fee.get('taxAmount', 0)
            
            # Add total
            total_row = table.add_row().cells
            total_row[0].text = ''
            total_row[1].text = 'TOTAL'
            total_row[2].text = f"${total_amount:.2f}"
            total_row[3].text = ''
            # Make total row bold
            for cell in total_row:
                for paragraph in cell.paragraphs:
                    for run in paragraph.runs:
                        run.bold = True
        
        # Add additional information
        doc.add_heading('Additional Information', level=1)
        additional_info = doc.add_paragraph()
        additional_info.add_run(f"Total Job Cost: ").bold = True
        additional_info.add_run(f"${permit_data.get('totalJobCost', 0):.2f}\n")
        additional_info.add_run(f"Application Categories: ").bold = True
        additional_info.add_run(f"{permit_data.get('applicationCategories', 'N/A')}\n")
        
        # Save document to BytesIO
        doc_stream = io.BytesIO()
        doc.save(doc_stream)
        doc_stream.seek(0)
        return doc_stream

    def process_speech_for_field(self, field_name: str, speech_text: str, auth_claims: dict[str, Any]) -> str:
        """Process speech transcription for specific field types"""
        
        # Clean up the speech text
        cleaned_text = speech_text.strip()
        
        # Field-specific processing
        if field_name in ["applicantName", "qualifiedTradesmanName", "onsiteContactName"]:
            # For name fields, capitalize each word
            return ' '.join(word.capitalize() for word in cleaned_text.split())
        
        elif field_name in ["applicantEmail", "cqtEmailAddress", "contactEmail"]:
            # For email fields, convert to lowercase and handle common speech patterns
            email_text = cleaned_text.lower()
            # Handle common speech patterns for email
            email_text = email_text.replace(" at ", "@")
            email_text = email_text.replace(" dot ", ".")
            email_text = email_text.replace("gmail", "gmail.com")
            email_text = email_text.replace("outlook", "outlook.com")
            email_text = email_text.replace("yahoo", "yahoo.com")
            email_text = email_text.replace("hotmail", "hotmail.com")
            # Remove spaces that might have been added during speech recognition
            email_text = email_text.replace(" ", "")
            return email_text
        
        elif field_name in ["applicantPhone", "contactPhoneNumber", "cqtContactNumber"]:
            # For phone fields, extract numbers and format
            import re
            # Extract digits from speech
            digits = re.sub(r'[^\d]', '', cleaned_text)
            if len(digits) == 10:
                # Format as (XXX) XXX-XXXX
                return f"({digits[:3]}) {digits[3:6]}-{digits[6:]}"
            elif len(digits) == 11 and digits.startswith('1'):
                # Handle 1-XXX-XXX-XXXX format
                return f"1-({digits[1:4]}) {digits[4:7]}-{digits[7:]}"
            else:
                # Return cleaned digits if format doesn't match standard patterns
                return digits
        
        elif field_name == "jobAddress":
            # For address fields, capitalize appropriately and handle common patterns
            address_text = cleaned_text.title()
            # Handle common address abbreviations
            address_text = address_text.replace(" Street", " St")
            address_text = address_text.replace(" Avenue", " Ave")
            address_text = address_text.replace(" Boulevard", " Blvd")
            address_text = address_text.replace(" Drive", " Dr")
            address_text = address_text.replace(" Road", " Rd")
            address_text = address_text.replace(" Place", " Pl")
            address_text = address_text.replace(" Southwest", " SW")
            address_text = address_text.replace(" Southeast", " SE")
            address_text = address_text.replace(" Northwest", " NW")
            address_text = address_text.replace(" Northeast", " NE")
            # Ensure Calgary, AB is added if not present
            if "calgary" not in address_text.lower():
                address_text += ", Calgary, AB"
            return address_text
        
        elif field_name in ["totalJobCost", "amps", "volts"]:
            # For numeric fields, extract numbers
            import re
            # Extract first number from speech
            numbers = re.findall(r'\d+(?:\.\d+)?', cleaned_text)
            if numbers:
                return numbers[0]
            else:
                # Try to convert written numbers to digits
                number_words = {
                    'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
                    'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
                    'ten': '10', 'twenty': '20', 'thirty': '30', 'forty': '40',
                    'fifty': '50', 'sixty': '60', 'seventy': '70', 'eighty': '80',
                    'ninety': '90', 'hundred': '100', 'thousand': '1000'
                }
                
                words = cleaned_text.lower().split()
                for word in words:
                    if word in number_words:
                        return number_words[word]
                
                return cleaned_text
        
        elif field_name == "phase":
            # For phase field, convert text to number
            if "single" in cleaned_text.lower() or "one" in cleaned_text.lower():
                return "1"
            elif "three" in cleaned_text.lower():
                return "3"
            else:
                # Extract number
                import re
                numbers = re.findall(r'\d+', cleaned_text)
                return numbers[0] if numbers else cleaned_text
        
        elif field_name in ["wire", "electricalService"]:
            # For material/service fields, capitalize first letter
            return cleaned_text.capitalize()
        
        elif field_name == "categoryOfWork":
            # Map speech to category options
            text_lower = cleaned_text.lower()
            if "residential" in text_lower or "home" in text_lower or "house" in text_lower:
                return "residential"
            elif "commercial" in text_lower or "business" in text_lower or "office" in text_lower:
                return "commercial"
            elif "industrial" in text_lower or "factory" in text_lower or "plant" in text_lower:
                return "industrial"
            else:
                return "residential"  # default
        
        elif field_name == "typeOfWork":
            # Map speech to work type options
            text_lower = cleaned_text.lower()
            if "new" in text_lower or "construction" in text_lower or "build" in text_lower:
                return "newBuilt"
            elif "renovation" in text_lower or "remodel" in text_lower or "upgrade" in text_lower:
                return "renovation"
            elif "addition" in text_lower or "extend" in text_lower:
                return "addition"
            elif "improvement" in text_lower or "improve" in text_lower:
                return "improvement"
            else:
                return "improvement"  # default
        
        elif field_name == "serviceType":
            # Map speech to service type options
            text_lower = cleaned_text.lower()
            if "main" in text_lower or "primary" in text_lower:
                return "main"
            elif "sub" in text_lower or "secondary" in text_lower:
                return "sub"
            elif "temporary" in text_lower or "temp" in text_lower:
                return "temporary"
            else:
                return "main"  # default
        
        elif field_name == "undergroundConductor":
            # Convert speech to boolean
            text_lower = cleaned_text.lower()
            if any(word in text_lower for word in ["yes", "true", "underground", "buried"]):
                return "true"
            elif any(word in text_lower for word in ["no", "false", "above", "overhead"]):
                return "false"
            else:
                return "false"  # default
        
        elif field_name == "requestDate":
            # Handle date speech - for now, just return current date
            # In a production system, you'd want more sophisticated date parsing
            from datetime import datetime
            return datetime.now().strftime("%Y-%m-%d")
        
        elif field_name == "permitStatus":
            # Map speech to permit status options
            text_lower = cleaned_text.lower()
            if "new" in text_lower:
                return "new"
            elif "submit" in text_lower or "submitted" in text_lower:
                return "submitted"
            elif "review" in text_lower or "reviewing" in text_lower:
                return "review"
            elif "approve" in text_lower or "approved" in text_lower:
                return "approved"
            else:
                return "new"  # default
        
        elif field_name == "permitType":
            # Map speech to permit type options
            text_lower = cleaned_text.lower()
            if "electrical" in text_lower or "electric" in text_lower:
                return "electrical"
            elif "building" in text_lower:
                return "building"
            elif "plumbing" in text_lower:
                return "plumbing"
            else:
                return "electrical"  # default
        
        else:
            # For other fields, return cleaned text with proper capitalization
            return cleaned_text.title() if cleaned_text else ""

# Initialize the service
permit_service = PermitApplicationService()

@permit_bp.before_app_serving
async def init_permit_applications_cosmos():
    """Initialize Cosmos DB client and container for permit applications"""
    USE_PERMIT_APPLICATIONS_COSMOS = os.getenv("USE_PERMIT_APPLICATIONS_COSMOS", "").lower() == "true"
    AZURE_COSMOSDB_ACCOUNT = os.getenv("AZURE_COSMOSDB_ACCOUNT")
    AZURE_PERMIT_APPLICATIONS_DATABASE = os.getenv("AZURE_PERMIT_APPLICATIONS_DATABASE", "permits")
    AZURE_PERMIT_APPLICATIONS_CONTAINER = os.getenv("AZURE_PERMIT_APPLICATIONS_CONTAINER", "applications")

    azure_credential: Union[AzureDeveloperCliCredential, ManagedIdentityCredential] = current_app.config[
        CONFIG_CREDENTIAL
    ]

    if USE_PERMIT_APPLICATIONS_COSMOS:
        current_app.logger.info("USE_PERMIT_APPLICATIONS_COSMOS is true, setting up CosmosDB client for permit applications")
        if not AZURE_COSMOSDB_ACCOUNT:
            raise ValueError("AZURE_COSMOSDB_ACCOUNT must be set when USE_PERMIT_APPLICATIONS_COSMOS is true")
        if not AZURE_PERMIT_APPLICATIONS_DATABASE:
            raise ValueError("AZURE_PERMIT_APPLICATIONS_DATABASE must be set when USE_PERMIT_APPLICATIONS_COSMOS is true")
        if not AZURE_PERMIT_APPLICATIONS_CONTAINER:
            raise ValueError("AZURE_PERMIT_APPLICATIONS_CONTAINER must be set when USE_PERMIT_APPLICATIONS_COSMOS is true")
        
        # Create Cosmos client and get container reference
        cosmos_client = CosmosClient(
            url=f"https://{AZURE_COSMOSDB_ACCOUNT}.documents.azure.com:443/", 
            credential=azure_credential,feature_flags=["enableAadDataPlane"]
        )
        cosmos_db = cosmos_client.get_database_client(AZURE_PERMIT_APPLICATIONS_DATABASE)
        cosmos_container = cosmos_db.get_container_client(AZURE_PERMIT_APPLICATIONS_CONTAINER)

        # Store in app config
        current_app.config[CONFIG_COSMOS_PERMIT_CLIENT] = cosmos_client
        current_app.config[CONFIG_COSMOS_PERMIT_CONTAINER] = cosmos_container
        current_app.config[CONFIG_PERMIT_APPLICATIONS_COSMOS_ENABLED] = True
        
        current_app.logger.info(f"Permit applications Cosmos DB initialized: {AZURE_COSMOSDB_ACCOUNT}/{AZURE_PERMIT_APPLICATIONS_DATABASE}/{AZURE_PERMIT_APPLICATIONS_CONTAINER}")
    else:
        current_app.config[CONFIG_PERMIT_APPLICATIONS_COSMOS_ENABLED] = False
        current_app.logger.info("Permit applications Cosmos DB disabled, using in-memory storage")


@permit_bp.after_app_serving
async def close_permit_applications_cosmos():
    """Close Cosmos DB client for permit applications"""
    if current_app.config.get(CONFIG_COSMOS_PERMIT_CLIENT):
        cosmos_client: CosmosClient = current_app.config[CONFIG_COSMOS_PERMIT_CLIENT]
        await cosmos_client.close()

@permit_bp.route("/create", methods=["POST"])
@authenticated
async def create_permit_application(auth_claims: dict[str, Any]):
    """Create a new permit application"""

    print("=== PERMIT API CREATE ENDPOINT CALLED ===")
    print(f"Auth claims: {auth_claims}")
    print(f"Request method: {request.method}")
    print(f"Request URL: {request.url}")
    print(f"Request headers: {dict(request.headers)}")
    
    try:
        if not request.is_json:
            return jsonify({"error": "Request must be JSON"}), 415
        
        request_json = await request.get_json()
        permit_data = request_json.get("permitApplication")
        
        if not permit_data:
            return jsonify({"error": "Permit application data is required"}), 400
        
        user_id = auth_claims.get("oid", "anonymous")
        result = await permit_service.create_permit_application(permit_data, user_id)
        print(result)
        
        if result["success"]:
            return jsonify(result), 201
        else:
            return jsonify(result), 400
            
    except Exception as e:
        return error_response(e, "/api/permit/create")

@permit_bp.route("/<permit_number>", methods=["GET"])
@authenticated
async def get_permit_application(auth_claims: dict[str, Any], permit_number: str):
    """Get a permit application by permit number"""
    try:
        user_id = auth_claims.get("oid", "anonymous")
        permit_data = await permit_service.get_permit_application(permit_number, user_id)
        
        if permit_data:
            return jsonify(permit_data), 200
        else:
            return jsonify({"error": "Permit application not found"}), 404
            
    except Exception as e:
        return error_response(e, f"/api/permit/{permit_number}")

@permit_bp.route("/update", methods=["PUT"])
@authenticated
async def update_permit_application(auth_claims: dict[str, Any]):
    """Update an existing permit application"""
    try:
        if not request.is_json:
            return jsonify({"error": "Request must be JSON"}), 415
        
        request_json = await request.get_json()
        permit_data = request_json.get("permitApplication")
        
        if not permit_data:
            return jsonify({"error": "Permit application data is required"}), 400
        
        user_id = auth_claims.get("oid", "anonymous")
        result = await permit_service.update_permit_application(permit_data, user_id)
        
        if result["success"]:
            return jsonify(result), 200
        else:
            return jsonify(result), 400
            
    except Exception as e:
        return error_response(e, "/api/permit/update")

@permit_bp.route("/autofill/user", methods=["GET"])
@authenticated
async def get_autofill_user_data(auth_claims: dict[str, Any]):

    print("=== AUTOFILL USER ENDPOINT CALLED ===")
    print(f"Auth claims: {auth_claims}")
    try:
        if not request.is_json:
            print("ERROR: Request is not JSON")
            return jsonify({"error": "Request must be JSON"}), 415
        
        request_json = await request.get_json()
        print(f"Request JSON: {request_json}")
        
        field_name = request_json.get("fieldName")
        session_id = request_json.get("sessionId")  # Optional session ID from frontend
        if not field_name:
            field_name = "applicantName"  # Default field if not provided
        print(f"Field name: {field_name}, Session ID: {session_id}")
        
        if field_name in ["applicantName"]:
            response_data = {"fieldName": field_name, "value": "John Doe"}
            print(f"Returning response: {response_data}")
        
            return jsonify(response_data), 200
        if not field_name:
            print("ERROR: Field name is missing")
            return jsonify({"error": "Field name is required"}), 400
        
        # Get auto-fill data based on field name
        print(f"Calling get_auto_fill_data_for_field with field: {field_name}")
        auto_fill_data = await permit_service.get_auto_fill_data_for_field(field_name, auth_claims, session_id)
        
        print(f"Auto-fill data retrieved: {auto_fill_data}")
        
        response_data = {"fieldName": field_name, "value": auto_fill_data}
        print(f"Returning response: {response_data}")
        
        return jsonify(response_data), 200

    # """Get user data for auto-filling permit application"""

    # print("Fetching user data for auto-fill", auth_claims)
    # try:
    #     # Extract user information from auth claims
    #     user_data = {
    #         "applicantName": auth_claims.get("name", "John Doe"),
    #         "applicantEmail": auth_claims.get("email", "johndoe@example.com"),
    #         "applicantPhone": "",  # Not typically available in auth claims
    #         "userId": auth_claims.get("oid", "")
    #     }
        
    #     # In a real implementation, you might query a user profile database
    #     # to get additional information like phone number, preferred address, etc.
        
    #     return jsonify(user_data), 200
        
    except Exception as e:
        return error_response(e, "/api/permit/autofill/user")


@permit_bp.route("/autofill/field", methods=["POST"])
@authenticated
async def get_autofill_field_data(auth_claims: dict[str, Any]):
    """Get auto-fill data for a specific field"""

    print("=== AUTOFILL FIELD ENDPOINT CALLED ===")
    print(f"Auth claims: {auth_claims}")
    try:
        if not request.is_json:
            print("ERROR: Request is not JSON")
            return jsonify({"error": "Request must be JSON"}), 415
        
        request_json = await request.get_json()
        print(f"Request JSON: {request_json}")
        
        field_name = request_json.get("fieldName")
        session_id = request_json.get("sessionId")  # Optional session ID from frontend
        
        print(f"Field name: {field_name}, Session ID: {session_id}")
        
        if not field_name:
            print("ERROR: Field name is missing")
            return jsonify({"error": "Field name is required"}), 400
        
        # Get auto-fill data based on field name
        print(f"Calling get_auto_fill_data_for_field with field: {field_name}")
        auto_fill_data = await permit_service.get_auto_fill_data_for_field(field_name, auth_claims, session_id)
        
        print(f"Auto-fill data retrieved: {auto_fill_data}")
        
        response_data = {"fieldName": field_name, "value": auto_fill_data}
        print(f"Returning response: {response_data}")
        
        return jsonify(response_data), 200
        
    except Exception as e:
        print(f"ERROR in autofill field endpoint: {str(e)}")
        return error_response(e, "/api/permit/autofill/field")

@permit_bp.route("/validate/address", methods=["POST"])
@authenticated
async def validate_address(auth_claims: dict[str, Any]):
    """Validate a Calgary address"""
    
    print("=== ADDRESS VALIDATION ENDPOINT CALLED ===")
    print(f"Auth claims: {auth_claims}")
    print(f"Request method: {request.method}")
    print(f"Request URL: {request.url}")
    
    try:
        if not request.is_json:
            return jsonify({"error": "Request must be JSON"}), 415
        
        request_json = await request.get_json()
        print(f"Request JSON: {request_json}")
        
        # Get address from request - handle both string and object formats
        address = request_json.get("address")
        
        # If address is an object, try to extract the string value
        if isinstance(address, dict):
            # Common patterns for address objects
            address_str = (
                address.get("formatted_address") or 
                address.get("address") or 
                address.get("value") or 
                address.get("text") or
                str(address)
            )
        elif isinstance(address, str):
            address_str = address
        else:
            address_str = str(address) if address is not None else ""
        
        print(f"Extracted address string: '{address_str}'")
        
        if not address_str or not address_str.strip():
            return jsonify({"error": "Address is required"}), 400
        
        # Validate the address string
        validation_result = permit_service.validate_address(address_str.strip())
        print(f"Validation result: {validation_result}")
        
        return jsonify(validation_result), 200
        
    except Exception as e:
        print(f"Error in address validation: {str(e)}")
        return error_response(e, "/api/permit/validate/address")

@permit_bp.route("/tradesman/<tradesman_id>", methods=["GET"])
@authenticated
async def get_tradesman_data(auth_claims: dict[str, Any], tradesman_id: str):
    """Get tradesman data by ID"""
    try:
        tradesman_data = permit_service.get_tradesman_data(tradesman_id)
        
        if tradesman_data:
            return jsonify(tradesman_data), 200
        else:
            return jsonify({"error": "Tradesman not found"}), 404
            
    except Exception as e:
        return error_response(e, f"/api/permit/tradesman/{tradesman_id}")

@permit_bp.route("/search", methods=["GET"])
@authenticated
async def search_permit_applications(auth_claims: dict[str, Any]):
    """Search permit applications"""
    try:
        query = request.args.get("q", "")
        
        if not query:
            return jsonify([]), 200
        
        # Simple search implementation
        results = []
        for permit_data in permit_service.permit_applications.values():
            # Check if query matches permit number, job name, or address
            if (query.lower() in permit_data.get("permitNumber", "").lower() or
                query.lower() in permit_data.get("jobName", "").lower() or
                query.lower() in permit_data.get("jobAddress", "").lower()):
                results.append(permit_data)
        
        return jsonify(results), 200
        
    except Exception as e:
        return error_response(e, "/api/permit/search")

@permit_bp.route("/inspection/book", methods=["POST"])
@authenticated
async def book_inspection(auth_claims: dict[str, Any]):
    """Book an inspection for a permit"""
    try:
        if not request.is_json:
            return jsonify({"error": "Request must be JSON"}), 415
        
        request_json = await request.get_json()
        permit_number = request_json.get("permitNumber")
        inspection_type = request_json.get("inspectionType")
        scheduled_date = request_json.get("scheduledDate")
        
        if not all([permit_number, inspection_type, scheduled_date]):
            return jsonify({"error": "Permit number, inspection type, and scheduled date are required"}), 400
        
        permit_data = permit_service.get_permit_application(permit_number)
        if not permit_data:
            return jsonify({"error": "Permit application not found"}), 404
        
        # Add inspection activity
        inspection_activity = {
            "id": str(uuid.uuid4()),
            "type": inspection_type,
            "dateScheduled": scheduled_date,
            "outcome": "pending",
            "inspectionTime": "TBD"
        }
        
        if "inspectionActivities" not in permit_data:
            permit_data["inspectionActivities"] = []
        
        permit_data["inspectionActivities"].append(inspection_activity)
        
        # Update the permit application
        user_id = auth_claims.get("oid", "anonymous")
        permit_service.update_permit_application(permit_data, user_id)
        
        return jsonify({"success": True, "message": "Inspection booked successfully"}), 200
        
    except Exception as e:
        return error_response(e, "/api/permit/inspection/book")


@permit_bp.route("/fees/calculate", methods=["POST"])
@authenticated
async def calculate_fees(auth_claims: dict[str, Any]):
    """Calculate permit fees based on permit type and job cost"""
    try:
        if not request.is_json:
            return jsonify({"error": "Request must be JSON"}), 415
        
        request_json = await request.get_json()
        permit_type = request_json.get("permitType", "electrical_permit")
        total_job_cost = float(request_json.get("totalJobCost", 0))
        
        # Calculate fees using the service
        fees = permit_service.calculate_permit_fees(permit_type, total_job_cost)
        
        return jsonify({"fees": fees}), 200
        
    except Exception as e:
        return error_response(e, "/api/permit/fees/calculate")


@permit_bp.route("/download/<permit_number>", methods=["GET"])
@authenticated
async def download_permit_application(auth_claims: dict[str, Any], permit_number: str):
    """Download permit application as Word document"""
    try:
        permit_data = permit_service.get_permit_application(permit_number)
        
        if not permit_data:
            return jsonify({"error": "Permit application not found"}), 404
        
        # Generate Word document
        doc_stream = permit_service.generate_word_document(permit_data)
        
        # Create filename
        filename = f"permit_application_{permit_number}.docx"
        
        return await send_file(
            doc_stream,
            mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            as_attachment=True,
            attachment_filename=filename
        )
        
    except Exception as e:
        return error_response(e, f"/api/permit/download/{permit_number}")


@permit_bp.route("/download/current", methods=["POST"])
@authenticated
async def download_current_permit_application(auth_claims: dict[str, Any]):
    """Download current permit application data as Word document"""
    try:
        if not request.is_json:
            return jsonify({"error": "Request must be JSON"}), 415
        
        request_json = await request.get_json()
        permit_data = request_json.get("permitApplication")
        
        if not permit_data:
            return jsonify({"error": "Permit application data is required"}), 400
        
        # Generate Word document
        doc_stream = permit_service.generate_word_document(permit_data)
        
        # Create filename
        permit_number = permit_data.get('permitNumber', 'new_application')
        filename = f"permit_application_{permit_number}.docx"
        
        return await send_file(
            doc_stream,
            mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            as_attachment=True,
            attachment_filename=filename
        )
        
    except Exception as e:
        return error_response(e, "/api/permit/download/current")

    async def search_permit_applications(self, user_id: str, filters: dict[str, Any] = None) -> list[dict[str, Any]]:
        """Search permit applications for a user with optional filters"""
        try:
            container = self._get_cosmos_container()
            if not container:
                logging.warning("Cosmos DB not available for permit search")
                return []
            
            # Build query based on filters
            query = "SELECT * FROM c WHERE c.user_id = @user_id AND c.type = @type"
            parameters = [
                {"name": "@user_id", "value": user_id},
                {"name": "@type", "value": "permit_application"}
            ]
            
            # Add optional filters
            if filters:
                if filters.get("permitType"):
                    query += " AND c.permitType = @permitType"
                    parameters.append({"name": "@permitType", "value": filters["permitType"]})
                
                if filters.get("status"):
                    query += " AND c.status = @status"
                    parameters.append({"name": "@status", "value": filters["status"]})
                
                if filters.get("dateFrom"):
                    query += " AND c.createdDate >= @dateFrom"
                    parameters.append({"name": "@dateFrom", "value": filters["dateFrom"]})
                
                if filters.get("dateTo"):
                    query += " AND c.createdDate <= @dateTo"
                    parameters.append({"name": "@dateTo", "value": filters["dateTo"]})
            
            # Add ordering
            query += " ORDER BY c.timestamp DESC"
            
            try:
                items = []
                async for item in container.query_items(
                    query=query,
                    parameters=parameters,
                    partition_key=user_id
                ):
                    items.append(item)
                
                logging.info(f"Found {len(items)} permit applications for user {user_id}")
                return items
                
            except exceptions.CosmosHttpResponseError as e:
                logging.error(f"Failed to search permit applications in Cosmos DB: {str(e)}")
                return []
                
        except Exception as e:
            logging.error(f"Error searching permit applications: {str(e)}")
            return []

@permit_bp.route("/autofill/speech", methods=["POST"])
@authenticated
async def autofill_from_speech(auth_claims: dict[str, Any]):
    """Auto-fill field data from speech transcription"""

    print("=== SPEECH AUTO-FILL ENDPOINT CALLED ===")
    print(f"Auth claims: {auth_claims}")
    
    try:
        if not request.is_json:
            return jsonify({"error": "Request must be JSON"}), 415
        
        request_json = await request.get_json()
        print(f"Request JSON: {request_json}")
        
        field_name = request_json.get("fieldName")
        speech_text = request_json.get("speechText")
        
        if not field_name:
            return jsonify({"error": "Field name is required"}), 400
        
        if not speech_text:
            return jsonify({"error": "Speech text is required"}), 400
        
        print(f"Processing speech auto-fill for field '{field_name}' with text: '{speech_text}'")
        
        # Process the speech text based on field type
        processed_value = permit_service.process_speech_for_field(field_name, speech_text, auth_claims)
        
        print(f"Processed value: '{processed_value}'")
        
        return jsonify({
            "fieldName": field_name,
            "originalText": speech_text,
            "processedValue": processed_value,
            "success": True
        }), 200
        
    except Exception as e:
        print(f"Error in speech auto-fill: {str(e)}")
        return error_response(e, "/api/permit/autofill/speech")

@permit_bp.route("/autofill/test", methods=["GET"])
@authenticated
async def test_autofill(auth_claims: dict[str, Any]):
    """Test endpoint to verify autofill functionality"""
    print("=== AUTOFILL TEST ENDPOINT CALLED ===")
    try:
        # Test the autofill for jobDescription and specificLocation
        test_results = {}
        
        for field in ["jobDescription", "specificLocation"]:
            try:
                value = await permit_service.get_auto_fill_data_for_field(field, auth_claims, "123456789")
                test_results[field] = {
                    "success": True,
                    "value": value,
                    "length": len(str(value)) if value else 0
                }
                print(f"Test {field}: SUCCESS - {value}")
            except Exception as e:
                test_results[field] = {
                    "success": False,
                    "error": str(e)
                }
                print(f"Test {field}: ERROR - {str(e)}")
        
        return jsonify({
            "message": "Autofill test completed",
            "results": test_results,
            "auth_user": auth_claims.get("name", "Unknown"),
            "timestamp": datetime.now().isoformat()
        }), 200
        
    except Exception as e:
        print(f"ERROR in autofill test: {str(e)}")
        return jsonify({"error": str(e)}), 500
