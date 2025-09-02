// ===============================
// Fichier: public/zipExportManager.js
// Gestionnaire d'exports ZIP en arrière-plan côté client
// ===============================

class ZipExportManager {
    constructor() {
        this.activeJobs = new Map(); // jobId -> job info
        this.statusCheckInterval = 2000; // Check every 2 seconds
        this.intervalId = null;
        this.notificationContainer = null;
        this.init();
    }

    init() {
        this.createNotificationContainer();
        this.startStatusMonitoring();
        
        // Load any existing jobs from localStorage
        this.loadPersistedJobs();
        
        console.log('📦 ZIP Export Manager initialized');
    }

    createNotificationContainer() {
        // Create notification container if it doesn't exist
        this.notificationContainer = document.getElementById('zip-export-notifications');
        if (!this.notificationContainer) {
            this.notificationContainer = document.createElement('div');
            this.notificationContainer.id = 'zip-export-notifications';
            this.notificationContainer.className = 'zip-export-notifications';
            document.body.appendChild(this.notificationContainer);
        }

        // Add CSS styles
        if (!document.getElementById('zip-export-styles')) {
            const styles = document.createElement('style');
            styles.id = 'zip-export-styles';
            styles.textContent = `
                .zip-export-notifications {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    z-index: 9999;
                    max-width: 400px;
                }
                
                .zip-export-notification {
                    background: #fff;
                    border: 1px solid #ddd;
                    border-radius: 8px;
                    padding: 16px;
                    margin-bottom: 12px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    transition: all 0.3s ease;
                }
                
                .zip-export-notification.success {
                    border-left: 4px solid #28a745;
                }
                
                .zip-export-notification.processing {
                    border-left: 4px solid #007bff;
                }
                
                .zip-export-notification.queued {
                    border-left: 4px solid #ffc107;
                }
                
                .zip-export-notification.error {
                    border-left: 4px solid #dc3545;
                }
                
                .zip-export-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 8px;
                }
                
                .zip-export-title {
                    font-weight: bold;
                    color: #333;
                }
                
                .zip-export-close {
                    background: none;
                    border: none;
                    font-size: 18px;
                    cursor: pointer;
                    color: #999;
                }
                
                .zip-export-progress {
                    width: 100%;
                    height: 8px;
                    background: #f0f0f0;
                    border-radius: 4px;
                    overflow: hidden;
                    margin: 8px 0;
                }
                
                .zip-export-progress-bar {
                    height: 100%;
                    background: #007bff;
                    transition: width 0.3s ease;
                }
                
                .zip-export-actions {
                    display: flex;
                    gap: 8px;
                    margin-top: 12px;
                }
                
                .zip-export-btn {
                    padding: 6px 12px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    background: #fff;
                    cursor: pointer;
                    font-size: 12px;
                    text-decoration: none;
                    color: #333;
                    transition: all 0.2s ease;
                }
                
                .zip-export-btn:hover {
                    background: #f8f9fa;
                    border-color: #adb5bd;
                }
                
                .zip-export-btn.primary {
                    background: #007bff;
                    color: white;
                    border-color: #007bff;
                }
                
                .zip-export-btn.primary:hover {
                    background: #0056b3;
                    border-color: #0056b3;
                }
                
                .zip-export-meta {
                    font-size: 12px;
                    color: #666;
                    margin-top: 4px;
                }
            `;
            document.head.appendChild(styles);
        }
    }

    // Start an export job
    async startExport(galleryId, publicationId, publicationLetter, options = {}) {
        try {
            const response = await fetch(`${BASE_API_URL}/api/zip-exports/publications/${galleryId}/${publicationId}/start`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': app.csrfToken
                },
                body: JSON.stringify({
                    priority: options.priority || 5
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to start export');
            }

            const result = await response.json();
            
            // Add job to tracking
            const jobInfo = {
                id: result.jobId,
                type: 'publication_export',
                galleryId,
                publicationId,
                publicationLetter,
                status: 'queued',
                createdAt: new Date().toISOString(),
                estimatedWaitTime: result.estimatedWaitTime,
                statusUrl: result.statusUrl
            };
            
            this.activeJobs.set(result.jobId, jobInfo);
            this.persistJobs();
            this.updateNotification(jobInfo);
            
            console.log(`📦 Started export job ${result.jobId} for Publication ${publicationLetter}`);
            
            return result.jobId;
            
        } catch (error) {
            console.error('Failed to start export:', error);
            this.showErrorNotification('Failed to start export', error.message);
            throw error;
        }
    }

    // Monitor job status
    startStatusMonitoring() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        
        this.intervalId = setInterval(() => {
            this.checkJobStatuses();
        }, this.statusCheckInterval);
    }

    async checkJobStatuses() {
        if (this.activeJobs.size === 0) {
            return;
        }

        const jobsToCheck = Array.from(this.activeJobs.values())
            .filter(job => job.status === 'queued' || job.status === 'processing');

        for (const job of jobsToCheck) {
            try {
                await this.checkJobStatus(job.id);
            } catch (error) {
                console.error(`Failed to check status for job ${job.id}:`, error);
            }
        }
    }

    async checkJobStatus(jobId) {
        try {
            const response = await fetch(`${BASE_API_URL}/api/zip-exports/status/${jobId}`);
            
            if (!response.ok) {
                if (response.status === 404) {
                    // Job not found, remove from tracking
                    this.removeJob(jobId);
                    return;
                }
                throw new Error(`HTTP ${response.status}`);
            }

            const status = await response.json();
            const job = this.activeJobs.get(jobId);
            
            if (!job) return;

            // Update job info
            const oldStatus = job.status;
            Object.assign(job, status);
            
            // Update notification if status changed
            if (oldStatus !== job.status) {
                this.updateNotification(job);
                
                if (job.status === 'completed') {
                    this.handleJobCompleted(job);
                } else if (job.status === 'failed') {
                    this.handleJobFailed(job);
                }
            } else if (job.status === 'processing') {
                // Update progress
                this.updateNotification(job);
            }
            
            this.persistJobs();
            
        } catch (error) {
            console.error(`Error checking job status for ${jobId}:`, error);
        }
    }

    handleJobCompleted(job) {
        console.log(`✅ Job ${job.id} completed`);
        
        // Auto-remove completed jobs after 5 minutes
        setTimeout(() => {
            this.removeJob(job.id);
        }, 5 * 60 * 1000);
    }

    handleJobFailed(job) {
        console.error(`❌ Job ${job.id} failed: ${job.error}`);
    }

    updateNotification(job) {
        let notification = document.getElementById(`zip-notification-${job.id}`);
        
        if (!notification) {
            notification = this.createNotificationElement(job);
            this.notificationContainer.appendChild(notification);
        }
        
        // Update content
        this.updateNotificationContent(notification, job);
    }

    createNotificationElement(job) {
        const notification = document.createElement('div');
        notification.id = `zip-notification-${job.id}`;
        notification.className = 'zip-export-notification';
        
        return notification;
    }

    updateNotificationContent(notification, job) {
        const statusClass = {
            'queued': 'queued',
            'processing': 'processing', 
            'completed': 'success',
            'failed': 'error'
        }[job.status] || 'queued';
        
        notification.className = `zip-export-notification ${statusClass}`;
        
        const title = `Publication ${job.publicationLetter} Export`;
        const statusText = this.getStatusText(job);
        const progress = job.progress || 0;
        
        notification.innerHTML = `
            <div class="zip-export-header">
                <div class="zip-export-title">${title}</div>
                <button class="zip-export-close" onclick="zipExportManager.removeJob('${job.id}')">&times;</button>
            </div>
            <div class="zip-export-meta">${statusText}</div>
            ${job.status === 'processing' ? `
                <div class="zip-export-progress">
                    <div class="zip-export-progress-bar" style="width: ${progress}%"></div>
                </div>
                <div class="zip-export-meta">${job.currentStep || 'Processing...'}</div>
            ` : ''}
            ${job.status === 'queued' ? `
                <div class="zip-export-meta">Position in queue: ${job.position || '?'}</div>
                ${job.estimatedWaitTime ? `<div class="zip-export-meta">Estimated wait: ${job.estimatedWaitTime}s</div>` : ''}
            ` : ''}
            <div class="zip-export-actions">
                ${job.status === 'completed' ? `
                    <a href="${BASE_API_URL}${job.downloadUrl}" class="zip-export-btn primary" download>
                        📥 Download ZIP
                    </a>
                ` : ''}
                ${job.status === 'queued' ? `
                    <button class="zip-export-btn" onclick="zipExportManager.cancelJob('${job.id}')">
                        ❌ Cancel
                    </button>
                ` : ''}
                ${job.status === 'failed' ? `
                    <button class="zip-export-btn" onclick="zipExportManager.retryJob('${job.id}')">
                        🔄 Retry
                    </button>
                ` : ''}
            </div>
        `;
    }

    getStatusText(job) {
        switch (job.status) {
            case 'queued':
                return 'Waiting in queue...';
            case 'processing':
                return `Processing... ${Math.round(job.progress || 0)}%`;
            case 'completed':
                return `Completed in ${this.formatDuration(job.processingTime)}`;
            case 'failed':
                return `Failed: ${job.error || 'Unknown error'}`;
            default:
                return 'Unknown status';
        }
    }

    formatDuration(ms) {
        if (!ms) return '?';
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${Math.round(ms / 1000)}s`;
        return `${Math.round(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
    }

    async cancelJob(jobId) {
        try {
            const response = await fetch(`${BASE_API_URL}/api/zip-exports/jobs/${jobId}`, {
                method: 'DELETE',
                headers: {
                    'X-CSRF-Token': app.csrfToken
                }
            });

            if (response.ok) {
                this.removeJob(jobId);
                console.log(`❌ Cancelled job ${jobId}`);
            } else {
                const error = await response.json();
                throw new Error(error.error || 'Failed to cancel job');
            }
        } catch (error) {
            console.error('Failed to cancel job:', error);
            this.showErrorNotification('Failed to cancel job', error.message);
        }
    }

    async retryJob(jobId) {
        const job = this.activeJobs.get(jobId);
        if (!job) return;
        
        this.removeJob(jobId);
        
        // Start new export
        try {
            await this.startExport(job.galleryId, job.publicationId, job.publicationLetter);
        } catch (error) {
            console.error('Failed to retry job:', error);
        }
    }

    removeJob(jobId) {
        this.activeJobs.delete(jobId);
        this.persistJobs();
        
        const notification = document.getElementById(`zip-notification-${jobId}`);
        if (notification) {
            notification.style.transform = 'translateX(100%)';
            notification.style.opacity = '0';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }
    }

    showErrorNotification(title, message) {
        const notification = document.createElement('div');
        notification.className = 'zip-export-notification error';
        notification.innerHTML = `
            <div class="zip-export-header">
                <div class="zip-export-title">${title}</div>
                <button class="zip-export-close" onclick="this.parentNode.parentNode.remove()">&times;</button>
            </div>
            <div class="zip-export-meta">${message}</div>
        `;
        
        this.notificationContainer.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
    }

    // Persistence methods
    persistJobs() {
        try {
            const jobsData = Array.from(this.activeJobs.entries());
            localStorage.setItem('zipExportJobs', JSON.stringify(jobsData));
        } catch (error) {
            console.error('Failed to persist jobs:', error);
        }
    }

    loadPersistedJobs() {
        try {
            const stored = localStorage.getItem('zipExportJobs');
            if (stored) {
                const jobsData = JSON.parse(stored);
                this.activeJobs = new Map(jobsData);
                
                // Update notifications for persisted jobs
                for (const job of this.activeJobs.values()) {
                    this.updateNotification(job);
                }
                
                console.log(`📦 Loaded ${this.activeJobs.size} persisted jobs`);
            }
        } catch (error) {
            console.error('Failed to load persisted jobs:', error);
            localStorage.removeItem('zipExportJobs');
        }
    }

    // Get user jobs from server
    async getUserJobs() {
        try {
            const response = await fetch(`${BASE_API_URL}/api/zip-exports/user/jobs`);
            if (response.ok) {
                const data = await response.json();
                return data.jobs;
            }
        } catch (error) {
            console.error('Failed to get user jobs:', error);
        }
        return [];
    }

    // Clean up on page unload
    destroy() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        this.persistJobs();
    }
}

// Create global instance
const zipExportManager = new ZipExportManager();

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    zipExportManager.destroy();
});

// Export for use in other scripts
window.zipExportManager = zipExportManager;