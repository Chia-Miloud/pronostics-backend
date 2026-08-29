const crypto = require('crypto');

const isProduction = process.env.NODE_ENV === 'production';
const errors = [];
const warnings = [];

let jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  if (isProduction) {
    errors.push('JWT_SECRET doit être définie et contenir au moins 32 caractères en production.');
  } else {
    jwtSecret = crypto.randomBytes(48).toString('hex');
    warnings.push('JWT_SECRET absente ou trop courte : une clé éphémère a été générée pour le développement.');
  }
}

if (!process.env.DATABASE_URL) {
  errors.push('DATABASE_URL doit être définie.');
}

if (errors.length > 0) {
  throw new Error(`Configuration invalide : ${errors.join(' ')}`);
}

if (warnings.length > 0) {
  warnings.forEach(message => console.warn(`⚠️ ${message}`));
}

module.exports = {
  isProduction,
  jwtSecret,
  databaseUrl: process.env.DATABASE_URL,
  pgSslRejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED === 'true',
};
