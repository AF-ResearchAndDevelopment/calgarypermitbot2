"""
Building Permit Application API endpoints
"""
import io
import json
import logging
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from docx import Document
from quart import Blueprint, current_app, jsonify, request, send_file
from azure.cosmos import exceptions

from decorators import authenticated
from error import error_response

# Create a blueprint for permit-related endpoints
permit_bp = Blueprint("permit", __name__, url_prefix="/api/permit")

class PermitApplicationService:
    """Service class for managing permit applications"""
    
    def __init__(self):
        # In a real implementation, you would connect to a database
        # For now, we'll use in-memory storage as a demo
        self.permit_applications = {}
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
    
    def generate_permit_number(self) -> str:
        """Generate a unique permit number"""
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        random_part = str(uuid.uuid4())[:8].upper()
        return f"PE{timestamp}{random_part}"
    
    def validate_address(self, address: str) -> Dict[str, Any]:
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
    
    def get_tradesman_data(self, tradesman_id: str) -> Optional[Dict[str, Any]]:
        """Get tradesman data from the database"""
        return self.tradesman_database.get(tradesman_id)
    
    def calculate_permit_fees(self, permit_type: str, total_job_cost: float) -> List[Dict[str, Any]]:
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
    
    def create_permit_application(self, permit_data: Dict[str, Any], user_id: str) -> Dict[str, Any]:
        """Create a new permit application"""
        try:
            # Generate permit number if not provided
            if not permit_data.get("permitNumber"):
                permit_data["permitNumber"] = self.generate_permit_number()
            
            # Add system fields
            permit_data["id"] = str(uuid.uuid4())
            permit_data["createdDate"] = datetime.now().isoformat()
            permit_data["lastModifiedDate"] = datetime.now().isoformat()
            permit_data["createdBy"] = user_id
            permit_data["lastModifiedBy"] = user_id
            
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
            
            # Store the application
            self.permit_applications[permit_data["permitNumber"]] = permit_data
            
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
    
    def get_permit_application(self, permit_number: str) -> Optional[Dict[str, Any]]:
        """Get a permit application by permit number"""
        return self.permit_applications.get(permit_number)
    
    def update_permit_application(self, permit_data: Dict[str, Any], user_id: str) -> Dict[str, Any]:
        """Update an existing permit application"""
        try:
            permit_number = permit_data.get("permitNumber")
            if not permit_number or permit_number not in self.permit_applications:
                return {
                    "success": False,
                    "message": "Permit application not found"
                }
            
            # Update system fields
            permit_data["lastModifiedDate"] = datetime.now().isoformat()
            permit_data["lastModifiedBy"] = user_id
            
            # Add update activity
            if "permitActivities" not in permit_data:
                permit_data["permitActivities"] = self.permit_applications[permit_number].get("permitActivities", [])
            
            permit_data["permitActivities"].append({
                "id": str(uuid.uuid4()),
                "type": "modified",
                "createdDate": datetime.now().isoformat(),
                "description": "Permit application updated",
                "performedBy": user_id
            })
            
            # Update the application
            self.permit_applications[permit_number] = permit_data
            
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
    
    def get_auto_fill_data_for_field(self, field_name: str, auth_claims: Dict[str, Any]) -> str:
        """Get auto-fill data for a specific field based on field name"""
        user_name = auth_claims.get("name", "")
        user_email = auth_claims.get("email", "")
        user_id = auth_claims.get("oid", "")
        
        # Sample data for different fields - in a real implementation, 
        # this would query databases, APIs, or user profiles
        auto_fill_data = {
            # Applicant Information
            "applicantName": user_name,
            "applicantEmail": user_email,
            "applicantPhone": "",  # Would typically come from user profile
            
            # Job Information
            "jobAddress": "",  # Could come from user's recent addresses or favorites
            "jobName": "Electrical Installation Project",
            "jobDescription": "Standard electrical installation work",
            "specificLocation": "Main floor",
            
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

# Initialize the service
permit_service = PermitApplicationService()

@permit_bp.route("/create", methods=["POST"])
@authenticated
async def create_permit_application(auth_claims: Dict[str, Any]):
    """Create a new permit application"""
    try:
        if not request.is_json:
            return jsonify({"error": "Request must be JSON"}), 415
        
        request_json = await request.get_json()
        permit_data = request_json.get("permitApplication")
        
        if not permit_data:
            return jsonify({"error": "Permit application data is required"}), 400
        
        user_id = auth_claims.get("oid", "anonymous")
        result = permit_service.create_permit_application(permit_data, user_id)
        
        if result["success"]:
            return jsonify(result), 201
        else:
            return jsonify(result), 400
            
    except Exception as e:
        return error_response(e, "/api/permit/create")

@permit_bp.route("/<permit_number>", methods=["GET"])
@authenticated
async def get_permit_application(auth_claims: Dict[str, Any], permit_number: str):
    """Get a permit application by permit number"""
    try:
        permit_data = permit_service.get_permit_application(permit_number)
        
        if permit_data:
            return jsonify(permit_data), 200
        else:
            return jsonify({"error": "Permit application not found"}), 404
            
    except Exception as e:
        return error_response(e, f"/api/permit/{permit_number}")

@permit_bp.route("/update", methods=["PUT"])
@authenticated
async def update_permit_application(auth_claims: Dict[str, Any]):
    """Update an existing permit application"""
    try:
        if not request.is_json:
            return jsonify({"error": "Request must be JSON"}), 415
        
        request_json = await request.get_json()
        permit_data = request_json.get("permitApplication")
        
        if not permit_data:
            return jsonify({"error": "Permit application data is required"}), 400
        
        user_id = auth_claims.get("oid", "anonymous")
        result = permit_service.update_permit_application(permit_data, user_id)
        
        if result["success"]:
            return jsonify(result), 200
        else:
            return jsonify(result), 400
            
    except Exception as e:
        return error_response(e, "/api/permit/update")

@permit_bp.route("/autofill/user", methods=["GET"])
@authenticated
async def get_autofill_user_data(auth_claims: Dict[str, Any]):
    """Get user data for auto-filling permit application"""

    print("Fetching user data for auto-fill", auth_claims)
    try:
        # Extract user information from auth claims
        user_data = {
            "applicantName": auth_claims.get("name", "John Doe"),
            "applicantEmail": auth_claims.get("email", "johndoe@example.com"),
            "applicantPhone": "",  # Not typically available in auth claims
            "userId": auth_claims.get("oid", "")
        }
        
        # In a real implementation, you might query a user profile database
        # to get additional information like phone number, preferred address, etc.
        
        return jsonify(user_data), 200
        
    except Exception as e:
        return error_response(e, "/api/permit/autofill/user")


@permit_bp.route("/autofill/field", methods=["POST"])
@authenticated
async def get_autofill_field_data(auth_claims: Dict[str, Any]):
    """Get auto-fill data for a specific field"""

    print("Fetching auto-fill data for field", auth_claims)
    try:
        if not request.is_json:
            return jsonify({"error": "Request must be JSON"}), 415
        
        request_json = await request.get_json()
        field_name = request_json.get("fieldName")
        
        if not field_name:
            return jsonify({"error": "Field name is required"}), 400
        
        # Get auto-fill data based on field name
        auto_fill_data = permit_service.get_auto_fill_data_for_field(field_name, auth_claims)
        
        return jsonify({"fieldName": field_name, "value": auto_fill_data}), 200
        
    except Exception as e:
        return error_response(e, "/api/permit/autofill/field")

@permit_bp.route("/validate/address", methods=["POST"])
@authenticated
async def validate_address(auth_claims: Dict[str, Any]):
    """Validate a Calgary address"""
    try:
        if not request.is_json:
            return jsonify({"error": "Request must be JSON"}), 415
        
        request_json = await request.get_json()
        address = request_json.get("address")
        
        if not address:
            return jsonify({"error": "Address is required"}), 400
        
        validation_result = permit_service.validate_address(address)
        return jsonify(validation_result), 200
        
    except Exception as e:
        return error_response(e, "/api/permit/validate/address")

@permit_bp.route("/tradesman/<tradesman_id>", methods=["GET"])
@authenticated
async def get_tradesman_data(auth_claims: Dict[str, Any], tradesman_id: str):
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
async def search_permit_applications(auth_claims: Dict[str, Any]):
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
async def book_inspection(auth_claims: Dict[str, Any]):
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
async def calculate_fees(auth_claims: Dict[str, Any]):
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
