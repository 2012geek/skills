/**
 * Custom Error Classes
 */

class FileNotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FileNotFoundError';
  }
}

class PermissionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PermissionError';
  }
}

class APIKeyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'APIKeyError';
  }
}

class RateLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RateLimitError';
  }
}

class TimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TimeoutError';
  }
}

class ImageNotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ImageNotFoundError';
  }
}

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

module.exports = {
  FileNotFoundError,
  PermissionError,
  APIKeyError,
  RateLimitError,
  TimeoutError,
  ImageNotFoundError,
  ValidationError
};
