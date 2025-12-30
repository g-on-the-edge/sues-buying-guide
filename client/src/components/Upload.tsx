import React, { useCallback, useState } from 'react';

interface UploadProps {
  onUpload: (file: File) => void;
  isLoading: boolean;
}

export const Upload: React.FC<UploadProps> = ({ onUpload, isLoading }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback((file: File) => {
    setError(null);

    if (file.type !== 'application/pdf') {
      setError('Please upload a PDF file');
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      setError('File size must be less than 50MB');
      return;
    }

    onUpload(file);
  }, [onUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFile(file);
    }
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  }, [handleFile]);

  return (
    <div className="upload-container">
      <div
        className={`upload-zone ${isDragOver ? 'drag-over' : ''} ${isLoading ? 'loading' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {isLoading ? (
          <div className="upload-loading">
            <div className="spinner"></div>
            <p>Processing PDF...</p>
            <p className="upload-hint">This may take a moment for large files</p>
          </div>
        ) : (
          <>
            <div className="upload-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <p className="upload-text">
              Drag & drop your Inventory Order Report PDF here
            </p>
            <p className="upload-or">or</p>
            <label className="upload-button">
              Browse Files
              <input
                type="file"
                accept=".pdf,application/pdf"
                onChange={handleInputChange}
                style={{ display: 'none' }}
              />
            </label>
            <p className="upload-hint">Supports PDF files up to 50MB</p>
          </>
        )}
      </div>
      {error && (
        <div className="upload-error">
          <span className="error-icon">!</span>
          {error}
        </div>
      )}
    </div>
  );
};
