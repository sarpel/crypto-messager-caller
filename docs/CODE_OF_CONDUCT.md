# Private Communication Platform

## Description
End-to-end encrypted messaging and voice communication platform.

## Links
- Documentation: [README.md](README.md)
- Security Policy: [SECURITY.md](SECURITY.md)
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)

## Installation

### Server
```bash
cd private-comm-server
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Client
```bash
cd private-comm-client
npm install
npx expo run:android
```

## Usage
1. Start PostgreSQL: `docker-compose up -d postgres`
2. Run migrations: `alembic upgrade head`
3. Start server and client
4. Register users and start communicating!

## Support
For issues, questions, or contributions, please see [CONTRIBUTING.md](CONTRIBUTING.md)

## Security
For security vulnerabilities, email: security@example.com

## License
MIT License - see [LICENSE](LICENSE) file
