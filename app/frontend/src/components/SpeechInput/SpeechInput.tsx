import React, { useState, useRef, useEffect } from "react";
import { IconButton, Stack, Text } from "@fluentui/react";
import styles from "./SpeechInput.module.css";

interface SpeechInputProps {
    onTranscript: (text: string) => void;
    isDisabled?: boolean;
    fieldName?: string;
    placeholder?: string;
}

interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList;
    resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
    error: string;
    message: string;
}

interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start(): void;
    stop(): void;
    abort(): void;
    addEventListener(type: "result", listener: (event: SpeechRecognitionEvent) => void): void;
    addEventListener(type: "error", listener: (event: SpeechRecognitionErrorEvent) => void): void;
    addEventListener(type: "start", listener: () => void): void;
    addEventListener(type: "end", listener: () => void): void;
}

declare global {
    interface Window {
        SpeechRecognition: new () => SpeechRecognition;
        webkitSpeechRecognition: new () => SpeechRecognition;
    }
}

const SpeechInput: React.FC<SpeechInputProps> = ({ onTranscript, isDisabled = false, fieldName = "", placeholder = "Click microphone and speak" }) => {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState("");
    const [error, setError] = useState<string | null>(null);
    const recognitionRef = useRef<SpeechRecognition | null>(null);

    // Check if speech recognition is supported
    const isSpeechRecognitionSupported = () => {
        return typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
    };

    useEffect(() => {
        if (!isSpeechRecognitionSupported()) {
            setError("Speech recognition not supported in this browser");
            return;
        }

        // Initialize speech recognition
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();

        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        recognition.addEventListener("result", (event: SpeechRecognitionEvent) => {
            let finalTranscript = "";
            let interimTranscript = "";

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                if (result.isFinal) {
                    finalTranscript += result[0].transcript;
                } else {
                    interimTranscript += result[0].transcript;
                }
            }

            const currentTranscript = finalTranscript || interimTranscript;
            setTranscript(currentTranscript);

            if (finalTranscript) {
                console.log(`Speech recognition final result for ${fieldName}:`, finalTranscript);
                onTranscript(finalTranscript.trim());
                setIsListening(false);
            }
        });

        recognition.addEventListener("error", (event: SpeechRecognitionErrorEvent) => {
            console.error("Speech recognition error:", event.error);
            setError(`Speech recognition error: ${event.error}`);
            setIsListening(false);
        });

        recognition.addEventListener("start", () => {
            console.log(`Speech recognition started for ${fieldName}`);
            setError(null);
            setTranscript("");
        });

        recognition.addEventListener("end", () => {
            console.log(`Speech recognition ended for ${fieldName}`);
            setIsListening(false);
        });

        recognitionRef.current = recognition;

        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.abort();
            }
        };
    }, [fieldName, onTranscript]);

    const startListening = () => {
        if (!recognitionRef.current || isDisabled) return;

        try {
            setIsListening(true);
            setError(null);
            recognitionRef.current.start();
        } catch (err) {
            console.error("Error starting speech recognition:", err);
            setError("Failed to start speech recognition");
            setIsListening(false);
        }
    };

    const stopListening = () => {
        if (!recognitionRef.current) return;

        try {
            recognitionRef.current.stop();
            setIsListening(false);
        } catch (err) {
            console.error("Error stopping speech recognition:", err);
        }
    };

    const toggleListening = () => {
        if (isListening) {
            stopListening();
        } else {
            startListening();
        }
    };

    if (!isSpeechRecognitionSupported()) {
        return null; // Don't render the component if not supported
    }

    return (
        <Stack className={styles.speechInputContainer}>
            <IconButton
                iconProps={{
                    iconName: isListening ? "MicrophoneOff" : "Microphone"
                }}
                title={isListening ? "Stop listening" : "Start voice input"}
                ariaLabel={isListening ? "Stop listening" : "Start voice input"}
                onClick={toggleListening}
                disabled={isDisabled}
                className={isListening ? styles.listeningButton : styles.microphoneButton}
            />
            {isListening && (
                <Text variant="small" className={styles.listeningText}>
                    Listening... {transcript && `"${transcript}"`}
                </Text>
            )}
            {error && (
                <Text variant="small" className={styles.errorText}>
                    {error}
                </Text>
            )}
        </Stack>
    );
};

export default SpeechInput;
