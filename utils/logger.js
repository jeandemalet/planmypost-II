// ===============================
// File: utils/logger.js
// Production-grade logging system with Winston
// ===============================

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for development (colorized and readable)
const devFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
        let log = `[${timestamp}] ${level}: ${message}`;
        
        // Add stack trace for errors
        if (stack) {
            log += `\n${stack}`;
        }
        
        // Add metadata if present
        if (Object.keys(meta).length > 0) {
            log += `\n${JSON.stringify(meta, null, 2)}`;
        }
        
        return log;
    })
);

// Custom format for production (structured JSON)
const prodFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

// Determine log level from environment
const logLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

// Create the logger
const logger = winston.createLogger({
    level: logLevel,
    defaultMeta: {
        service: 'publication-organizer',
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development'
    },
    transports: []
});

// Development configuration
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: devFormat,
        handleExceptions: true,
        handleRejections: true
    }));
} else {
    // Production configuration
    logger.add(new winston.transports.Console({
        format: prodFormat,
        level: 'warn' // Only show warnings and errors in production console
    }));
}

// File transports for all environments
logger.add(new DailyRotateFile({
    filename: path.join(logsDir, 'application-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxFiles: '14d', // Keep logs for 14 days
    maxSize: '20m',  // Rotate when file reaches 20MB
    format: prodFormat,
    handleExceptions: true,
    handleRejections: true
}));

// Separate error log file
logger.add(new DailyRotateFile({
    filename: path.join(logsDir, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    level: 'error',
    maxFiles: '30d', // Keep error logs longer
    maxSize: '20m',
    format: prodFormat
}));

// Security audit log (for authentication, authorization events)
const securityLogger = winston.createLogger({
    level: 'info',
    defaultMeta: {
        service: 'publication-organizer-security',
        environment: process.env.NODE_ENV || 'development'
    },
    transports: [
        new DailyRotateFile({
            filename: path.join(logsDir, 'security-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            maxFiles: '90d', // Keep security logs for 90 days
            maxSize: '10m',
            format: prodFormat
        })
    ]
});

// Performance monitoring logger
const performanceLogger = winston.createLogger({
    level: 'info',
    defaultMeta: {
        service: 'publication-organizer-performance',
        environment: process.env.NODE_ENV || 'development'
    },
    transports: [
        new DailyRotateFile({
            filename: path.join(logsDir, 'performance-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            maxFiles: '7d', // Keep performance logs for 7 days
            maxSize: '10m',
            format: prodFormat
        })
    ]
});

// Convenience methods for structured logging
const loggers = {
    // Main application logger
    info: (message, meta = {}) => logger.info(message, meta),
    warn: (message, meta = {}) => logger.warn(message, meta),
    error: (message, meta = {}) => logger.error(message, meta),
    debug: (message, meta = {}) => logger.debug(message, meta),
    
    // Security events
    security: {
        login: (userId, ip, userAgent, success = true) => {
            securityLogger.info('User login attempt', {
                event: 'login',
                userId,
                ip,
                userAgent,
                success,
                timestamp: new Date().toISOString()
            });
        },
        logout: (userId, ip) => {
            securityLogger.info('User logout', {
                event: 'logout',
                userId,
                ip,
                timestamp: new Date().toISOString()
            });
        },
        authFailure: (ip, userAgent, reason) => {
            securityLogger.warn('Authentication failure', {
                event: 'auth_failure',
                ip,
                userAgent,
                reason,
                timestamp: new Date().toISOString()
            });
        },
        suspiciousActivity: (userId, activity, details) => {
            securityLogger.warn('Suspicious activity detected', {
                event: 'suspicious_activity',
                userId,
                activity,
                details,
                timestamp: new Date().toISOString()
            });
        }
    },
    
    // Performance monitoring
    performance: {
        apiRequest: (method, url, duration, statusCode, userId) => {
            performanceLogger.info('API request completed', {
                event: 'api_request',
                method,
                url,
                duration,
                statusCode,
                userId,
                timestamp: new Date().toISOString()
            });
        },
        dbQuery: (collection, operation, duration, resultCount) => {
            performanceLogger.info('Database query completed', {
                event: 'db_query',
                collection,
                operation,
                duration,
                resultCount,
                timestamp: new Date().toISOString()
            });
        },
        imageProcessing: (operation, fileName, duration, inputSize, outputSize) => {
            performanceLogger.info('Image processing completed', {
                event: 'image_processing',
                operation,
                fileName,
                duration,
                inputSize,
                outputSize,
                compressionRatio: inputSize > 0 ? (outputSize / inputSize) : 0,
                timestamp: new Date().toISOString()
            });
        }
    },
    
    // HTTP request logging middleware
    requestLogger: () => {
        return (req, res, next) => {
            const startTime = Date.now();
            
            // Log request start
            logger.debug('HTTP request started', {
                method: req.method,
                url: req.url,
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                userId: req.userData?.userId
            });
            
            // Override res.end to log completion
            const originalEnd = res.end;
            res.end = function(...args) {
                const duration = Date.now() - startTime;
                
                // Log request completion
                const logLevel = res.statusCode >= 400 ? 'warn' : 'info';
                logger[logLevel]('HTTP request completed', {
                    method: req.method,
                    url: req.url,
                    statusCode: res.statusCode,
                    duration,
                    ip: req.ip,
                    userId: req.userData?.userId
                });
                
                // Log to performance logger for API requests
                if (req.url.startsWith('/api/')) {
                    loggers.performance.apiRequest(
                        req.method,
                        req.url,
                        duration,
                        res.statusCode,
                        req.userData?.userId
                    );
                }
                
                originalEnd.apply(this, args);
            };
            
            next();
        };
    }
};

// Export both individual loggers and convenience object
module.exports = {
    logger,
    securityLogger,
    performanceLogger,
    ...loggers
};

// Log initialization
logger.info('Logger initialized', {
    level: logLevel,
    environment: process.env.NODE_ENV || 'development',
    logsDirectory: logsDir
});