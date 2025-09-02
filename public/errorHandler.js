// ===============================
// File: public/errorHandler.js
// Centralized error handling and user notification system
// ===============================

import { NOTIFICATION_TYPES } from './constants.js';

class ErrorHandler {
    constructor() {
        this.notificationContainer = null;
        this.initializeNotificationContainer();
        this.setupGlobalErrorHandlers();
    }

    initializeNotificationContainer() {
        // Create notification container if it doesn't exist
        this.notificationContainer = document.getElementById('notification-container');
        if (!this.notificationContainer) {
            this.notificationContainer = document.createElement('div');
            this.notificationContainer.id = 'notification-container';
            this.notificationContainer.className = 'notification-container';
            document.body.appendChild(this.notificationContainer);
        }

        // Add CSS if not already present
        if (!document.getElementById('notification-styles')) {
            this.addNotificationStyles();
        }
    }

    addNotificationStyles() {
        const styles = document.createElement('style');
        styles.id = 'notification-styles';
        styles.textContent = `
            .notification-container {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 10000;
                max-width: 400px;
                pointer-events: none;
            }
            
            .notification {
                background: #fff;
                border-radius: 8px;
                padding: 16px 20px;
                margin-bottom: 12px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                border-left: 4px solid #ccc;
                pointer-events: auto;
                transition: all 0.3s ease;
                transform: translateX(100%);
                opacity: 0;
            }
            
            .notification.show {
                transform: translateX(0);
                opacity: 1;
            }
            
            .notification.success {
                border-left-color: #28a745;
            }
            
            .notification.error {
                border-left-color: #dc3545;
            }
            
            .notification.warning {
                border-left-color: #ffc107;
            }
            
            .notification.info {
                border-left-color: #17a2b8;
            }
            
            .notification-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 8px;
            }
            
            .notification-title {
                font-weight: bold;
                color: #333;
            }
            
            .notification-close {
                background: none;
                border: none;
                font-size: 18px;
                cursor: pointer;
                color: #999;
                padding: 0;
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .notification-close:hover {
                color: #666;
            }
            
            .notification-message {
                color: #666;
                font-size: 14px;
                line-height: 1.4;
            }
            
            .notification-actions {
                margin-top: 12px;
                display: flex;
                gap: 8px;
            }
            
            .notification-btn {
                padding: 6px 12px;
                border: 1px solid #ddd;
                border-radius: 4px;
                background: #f8f9fa;
                cursor: pointer;
                font-size: 12px;
                text-decoration: none;
                color: #333;
                transition: all 0.2s ease;
            }
            
            .notification-btn:hover {
                background: #e9ecef;
            }
            
            .notification-btn.primary {
                background: #007bff;
                color: white;
                border-color: #007bff;
            }
            
            .notification-btn.primary:hover {
                background: #0056b3;
            }
        `;
        document.head.appendChild(styles);
    }

    setupGlobalErrorHandlers() {
        // Handle unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            console.error('Unhandled promise rejection:', event.reason);
            this.showNotification(
                'Unexpected Error',
                'An unexpected error occurred. Please try again or refresh the page.',
                NOTIFICATION_TYPES.ERROR
            );
        });

        // Handle global JavaScript errors
        window.addEventListener('error', (event) => {
            console.error('Global error:', event.error);
            if (event.error && !event.error.handled) {
                this.showNotification(
                    'Application Error',
                    'A technical error occurred. Some features may not work correctly.',
                    NOTIFICATION_TYPES.ERROR
                );
                event.error.handled = true;
            }
        });
    }

    showNotification(title, message, type = NOTIFICATION_TYPES.INFO, options = {}) {
        const {
            duration = 5000,
            actions = [],
            persist = false
        } = options;

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        const notificationId = `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        notification.id = notificationId;

        let actionsHtml = '';
        if (actions.length > 0) {
            actionsHtml = `
                <div class="notification-actions">
                    ${actions.map(action => `
                        <button class="notification-btn ${action.primary ? 'primary' : ''}" 
                                onclick="${action.onClick}">
                            ${action.label}
                        </button>
                    `).join('')}
                </div>
            `;
        }

        notification.innerHTML = `
            <div class="notification-header">
                <div class="notification-title">${title}</div>
                <button class="notification-close" onclick="errorHandler.removeNotification('${notificationId}')">&times;</button>
            </div>
            <div class="notification-message">${message}</div>
            ${actionsHtml}
        `;

        this.notificationContainer.appendChild(notification);

        // Trigger animation
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);

        // Auto-remove if not persistent
        if (!persist) {
            setTimeout(() => {
                this.removeNotification(notificationId);
            }, duration);
        }

        return notificationId;
    }

    removeNotification(notificationId) {
        const notification = document.getElementById(notificationId);
        if (notification) {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }
    }

    // Convenience methods for different notification types
    showSuccess(title, message, options = {}) {
        return this.showNotification(title, message, NOTIFICATION_TYPES.SUCCESS, options);
    }

    showError(title, message, options = {}) {
        return this.showNotification(title, message, NOTIFICATION_TYPES.ERROR, { 
            duration: 8000, // Longer duration for errors
            ...options 
        });
    }

    showWarning(title, message, options = {}) {
        return this.showNotification(title, message, NOTIFICATION_TYPES.WARNING, options);
    }

    showInfo(title, message, options = {}) {
        return this.showNotification(title, message, NOTIFICATION_TYPES.INFO, options);
    }

    // Handle API errors with user-friendly messages
    handleApiError(error, context = '') {
        console.error(`API Error${context ? ` (${context})` : ''}:`, error);
        
        let title = 'Request Failed';
        let message = 'An error occurred while processing your request.';
        
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            title = 'Connection Error';
            message = 'Unable to connect to the server. Please check your internet connection.';
        } else if (error.status === 401) {
            title = 'Authentication Required';
            message = 'Please log in again to continue.';
        } else if (error.status === 403) {
            title = 'Access Denied';
            message = 'You do not have permission to perform this action.';
        } else if (error.status === 404) {
            title = 'Not Found';
            message = 'The requested resource was not found.';
        } else if (error.status >= 500) {
            title = 'Server Error';
            message = 'A server error occurred. Please try again later.';
        } else if (error.message) {
            message = error.message;
        }

        return this.showError(title, message);
    }

    // Handle successful operations
    handleSuccess(operation, details = '') {
        const messages = {
            save: 'Changes saved successfully',
            upload: 'Files uploaded successfully',
            delete: 'Item deleted successfully',
            export: 'Export completed successfully',
            import: 'Import completed successfully'
        };

        const title = 'Success';
        const message = messages[operation] || 'Operation completed successfully';
        const fullMessage = details ? `${message}. ${details}` : message;

        return this.showSuccess(title, fullMessage);
    }

    // Clear all notifications
    clearAll() {
        const notifications = this.notificationContainer.querySelectorAll('.notification');
        notifications.forEach(notification => {
            this.removeNotification(notification.id);
        });
    }
}

// Create global instance
const errorHandler = new ErrorHandler();

// Export for use in other modules
window.errorHandler = errorHandler;

// Also export for ES6 imports
export default errorHandler;