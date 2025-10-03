# SSL Certificate Generation Script
# Run this to generate self-signed certificates for development

# Generate private key
openssl genrsa -out key.pem 2048

# Generate certificate
openssl req -new -x509 -key key.pem -out cert.pem -days 365 -subj "/C=US/ST=Local/L=Development/O=Plex Watch Together/OU=Dev/CN=localhost"

echo "SSL certificates generated:"
echo "- Private key: key.pem"
echo "- Certificate: cert.pem"
echo ""
echo "For production, replace these with proper SSL certificates from a CA."