import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import './LecturerPortal.css';

const LecturerPortal = ({ user }) => {
    const [selectedFile, setSelectedFile] = useState(null);
    const [uploadStatus, setUploadStatus] = useState('');
    const [receipt, setReceipt] = useState(null);
    const [moduleCode, setModuleCode] = useState('');

    const onDrop = useCallback((acceptedFiles) => {
        if (acceptedFiles && acceptedFiles.length > 0) {
            setSelectedFile(acceptedFiles[0]);
            setUploadStatus('idle');
            setReceipt(null);
        }
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
            'text/csv': ['.csv']
        },
        maxFiles: 1
    });

    const handleUpload = async () => {
        if (!selectedFile) return;
        setUploadStatus('uploading');

        const formData = new FormData();
        formData.append('gradingSheet', selectedFile);
        formData.append('moduleCode', moduleCode);
        formData.append('uploader', user.name);

        try {
            const response = await axios.post('http://localhost:5000/api/ingest', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setUploadStatus('success');
            setReceipt(response.data);
            setModuleCode(''); // Clear input on success
        } catch (error) {
            console.error('Upload failed:', error);
            setUploadStatus('error');
        }
    };

    return (
        <div className="portal-wrapper">
            {/* NOTE: The <nav> bar was completely removed from here! App.jsx handles it now. */}

            <div className="portal-container">
                <div className="portal-header">
                    <h2>Secure Data Ingestion</h2>
                    <p>
                        Scale-ready academic records management. Upload your grading sheets to mathematically 
                        seal records via the Silent Bridge decentralized middleware.
                    </p>
                </div>

                <div {...getRootProps()} className={`dropzone ${isDragActive ? 'drag-active' : ''}`}>
                    <input {...getInputProps()} />
                    <div className="dropzone-content">
                        <span className="upload-icon">💠</span>
                        {isDragActive ? (
                            <p>Release to secure the file...</p>
                        ) : (
                            <>
                                <p>Select or drag grading sheet</p>
                                <span>Supports .xlsx and .csv files</span>
                            </>
                        )}
                    </div>
                </div>

                {selectedFile && (
                    <div className="file-details">
                        <div className="file-info-header">
                            <span className="file-icon" style={{ fontSize: '1.5rem' }}>📄</span>
                            <span className="file-name" style={{ fontSize: '1.1rem' }}>{selectedFile.name}</span>
                        </div>

                        {/* FIXED: Module Input & Button Layout */}
                        <div className="upload-actions">
                            <input 
                                type="text" 
                                placeholder="Enter Module Code (e.g. SE301)" 
                                value={moduleCode}
                                onChange={(e) => setModuleCode(e.target.value.toUpperCase())}
                                required
                                className="module-input"
                            />
                            <button 
                                className="upload-btn" 
                                onClick={handleUpload}
                                disabled={uploadStatus === 'uploading' || !moduleCode.trim()}
                            >
                                {uploadStatus === 'uploading' ? 'Sealing...' : 'Verify & Ledger Upload'}
                            </button>
                        </div>
                    </div>
                )}

                {uploadStatus === 'error' && (
                    <div className="alert error">
                        ⚠️ Connection failure. Decentralized middleware at port 5000 is unreachable.
                    </div>
                )}

                {uploadStatus === 'success' && receipt && receipt.status === 'duplicate' && (
                    <div className="alert warning" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', border: '1px solid var(--warning)', color: '#fcd34d', marginTop: '2rem' }}>
                        <div>
                            <strong style={{ display: 'block', fontSize: '1.1rem', marginBottom: '5px' }}>⚠️ Duplicate Payload Rejected</strong>
                            This exact cryptographic hash has already been anchored to the ledger for <strong>{receipt.moduleCode}</strong>.
                        </div>
                    </div>
                )}
                {/* Standard Success Receipt for New Uploads */}
                {uploadStatus === 'success' && receipt && receipt.status === 'new' && (
                    <div className="receipt-card">
                        <h3>✅ Cryptographically Secured</h3>
                        <p><strong>{receipt.recordCount} entries</strong> have been parsed, validated, and permanently sealed.</p>
                        <div className="hash-box">
                            <small>SHA-256 Provenance Hash</small>
                            <code>{receipt.provenanceHash}</code>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default LecturerPortal;