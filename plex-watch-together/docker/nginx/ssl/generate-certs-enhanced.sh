#!/bin/bash
# Enhanced SSL Certificate Generation Script
# Supports both development and production certificate generation

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOMAIN="${1:-localhost}"
MODE="${2:-dev}"
DAYS="${3:-365}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Print usage
usage() {
    echo "Usage: $0 [domain] [mode] [days]"
    echo ""
    echo "Arguments:"
    echo "  domain    Domain name (default: localhost)"
    echo "  mode      Certificate mode: dev|prod|letsencrypt (default: dev)"
    echo "  days      Certificate validity in days (default: 365)"
    echo ""
    echo "Examples:"
    echo "  $0                                    # Generate dev certs for localhost"
    echo "  $0 example.com dev 365               # Generate dev certs for example.com"
    echo "  $0 example.com prod 90               # Generate production certs for example.com"
    echo "  $0 example.com letsencrypt           # Setup Let's Encrypt for example.com"
    echo ""
}

# Check if OpenSSL is available
check_openssl() {
    if ! command -v openssl &> /dev/null; then
        log_error "OpenSSL is not installed. Please install OpenSSL first."
        exit 1
    fi
    log_info "OpenSSL version: $(openssl version)"
}

# Generate development certificates (self-signed)
generate_dev_certs() {
    local domain=$1
    local days=$2
    
    log_info "Generating development SSL certificates for domain: $domain"
    
    # Create SSL directory if it doesn't exist
    mkdir -p "$SCRIPT_DIR"
    cd "$SCRIPT_DIR"
    
    # Generate private key with stronger encryption
    log_info "Generating private key..."
    openssl genrsa -out key.pem 4096
    
    # Create certificate configuration
    cat > cert.conf << EOF
[req]
default_bits = 4096
prompt = no
default_md = sha256
req_extensions = req_ext
distinguished_name = dn

[dn]
C=US
ST=Development
L=Local
O=Plex Watch Together
OU=Development Team
CN=$domain

[req_ext]
subjectAltName = @alt_names

[alt_names]
DNS.1 = $domain
DNS.2 = *.$domain
DNS.3 = localhost
DNS.4 = *.localhost
IP.1 = 127.0.0.1
IP.2 = ::1
EOF

    # Generate certificate signing request
    log_info "Generating certificate signing request..."
    openssl req -new -key key.pem -out cert.csr -config cert.conf
    
    # Generate self-signed certificate
    log_info "Generating self-signed certificate..."
    openssl x509 -req -in cert.csr -signkey key.pem -out cert.pem -days $days -extensions req_ext -extfile cert.conf
    
    # Generate DH parameters for better security
    log_info "Generating Diffie-Hellman parameters..."
    openssl dhparam -out dhparam.pem 2048
    
    # Create certificate chain (self-signed, so same as cert)
    cp cert.pem chain.pem
    
    # Set appropriate permissions
    chmod 600 key.pem
    chmod 644 cert.pem chain.pem dhparam.pem
    
    # Cleanup
    rm cert.csr cert.conf
    
    log_success "Development certificates generated successfully!"
}

# Generate production certificates (CA-signed ready)
generate_prod_certs() {
    local domain=$1
    local days=$2
    
    log_info "Generating production-ready SSL certificate request for domain: $domain"
    
    mkdir -p "$SCRIPT_DIR"
    cd "$SCRIPT_DIR"
    
    # Generate private key
    log_info "Generating private key..."
    openssl genrsa -out key.pem 4096
    
    # Create certificate configuration for production
    cat > cert.conf << EOF
[req]
default_bits = 4096
prompt = no
default_md = sha256
req_extensions = v3_req
distinguished_name = dn

[dn]
C=US
ST=Production
L=Server
O=Plex Watch Together
OU=Production Team
CN=$domain

[v3_req]
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = $domain
DNS.2 = *.$domain
EOF

    # Generate certificate signing request
    log_info "Generating certificate signing request..."
    openssl req -new -key key.pem -out $domain.csr -config cert.conf
    
    # For production, we'll create a temporary self-signed cert
    # In real production, you'd use the CSR with a CA
    log_warning "Creating temporary self-signed certificate for production setup..."
    openssl x509 -req -in $domain.csr -signkey key.pem -out cert.pem -days $days -extensions v3_req -extfile cert.conf
    
    # Generate DH parameters
    log_info "Generating Diffie-Hellman parameters..."
    openssl dhparam -out dhparam.pem 4096
    
    # Create chain file
    cp cert.pem chain.pem
    
    # Set permissions
    chmod 600 key.pem
    chmod 644 cert.pem chain.pem dhparam.pem $domain.csr
    
    # Cleanup config file
    rm cert.conf
    
    log_success "Production certificate files generated!"
    log_warning "Remember to replace cert.pem and chain.pem with CA-signed certificates"
    log_info "Use $domain.csr to request certificates from your Certificate Authority"
}

# Verify certificates
verify_certificates() {
    local domain=$1
    
    log_info "Verifying SSL certificates..."
    
    if [ -f "$SCRIPT_DIR/cert.pem" ] && [ -f "$SCRIPT_DIR/key.pem" ]; then
        # Check certificate validity
        log_info "Certificate details:"
        openssl x509 -in "$SCRIPT_DIR/cert.pem" -text -noout | grep -E "(Subject:|Issuer:|Not Before:|Not After:|DNS:|IP Address:)" || true
        
        # Verify private key matches certificate
        cert_modulus=$(openssl x509 -noout -modulus -in "$SCRIPT_DIR/cert.pem" | openssl md5)
        key_modulus=$(openssl rsa -noout -modulus -in "$SCRIPT_DIR/key.pem" | openssl md5)
        
        if [ "$cert_modulus" = "$key_modulus" ]; then
            log_success "Certificate and private key match!"
        else
            log_error "Certificate and private key do not match!"
            exit 1
        fi
    else
        log_error "Certificate files not found!"
        exit 1
    fi
}

# Main execution
main() {
    if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
        usage
        exit 0
    fi
    
    log_info "SSL Certificate Generator for Plex Watch Together"
    log_info "Domain: $DOMAIN | Mode: $MODE | Days: $DAYS"
    echo ""
    
    # Check prerequisites
    check_openssl
    
    # Execute based on mode
    case $MODE in
        "dev")
            generate_dev_certs "$DOMAIN" "$DAYS"
            ;;
        "prod")
            generate_prod_certs "$DOMAIN" "$DAYS"
            ;;
        *)
            log_error "Invalid mode: $MODE. Use 'dev' or 'prod'"
            usage
            exit 1
            ;;
    esac
    
    # Verify generated certificates
    verify_certificates "$DOMAIN"
    
    echo ""
    log_success "SSL setup completed!"
    echo ""
    echo "Generated files:"
    echo "  - key.pem      : Private key"
    echo "  - cert.pem     : Certificate"
    echo "  - chain.pem    : Certificate chain"
    echo "  - dhparam.pem  : DH parameters"
    echo ""
    
    if [ "$MODE" = "dev" ]; then
        log_warning "These are self-signed certificates for development only!"
        log_info "For production, run: $0 $DOMAIN prod"
    elif [ "$MODE" = "prod" ]; then
        log_warning "Replace cert.pem and chain.pem with CA-signed certificates for production!"
        log_info "Use the generated CSR file to request certificates from a CA"
    fi
    
    echo ""
    log_info "Next steps:"
    echo "  1. Update docker-compose.yml with your domain name"
    echo "  2. Start the services: docker-compose up -d"
    echo "  3. Test HTTPS access: https://$DOMAIN"
}

# Run main function with all arguments
main "$@"