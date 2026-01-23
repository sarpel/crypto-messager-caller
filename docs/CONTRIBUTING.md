# Contributing to Private Communication Platform

## Security Policy

**IMPORTANT**: This is a security-critical E2EE messaging platform. Before contributing:

1. **Never commit encryption keys or secrets**
2. **Never add logging that exposes user data**
3. **Never weaken cryptographic standards**
4. **Always follow zero-trust principles** (server must not see plaintext)

For security vulnerabilities, email: security@example.com (DO NOT use GitHub issues)

## Development Setup

### Server (Python + FastAPI)
```bash
cd private-comm-server
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
docker-compose up -d postgres
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Client (React Native + Expo)
```bash
cd private-comm-client
npm install
npx expo prebuild --platform android
npx expo run:android
```

### Database Migrations
```bash
cd private-comm-server
alembic revision --autogenerate -m "description"
alembic upgrade head
```

## Coding Standards

### Python (Server)
- Follow PEP 8
- Use type hints everywhere
- Write tests for new features
- Run: `pytest tests/ -v --cov=app --cov-fail-under=80`

### TypeScript (Client)
- Use strict null checks
- Prefer functional patterns
- Write tests for new features
- Run: `npm test`

## Before Submitting

- [ ] Code follows project style guide
- [ ] All tests pass
- [ ] No new security vulnerabilities introduced
- [ ] Documentation updated (if applicable)
- [ ] Commit message follows: `type(scope): description`

## Commit Message Format

```
type(scope): description

Types: feat, fix, refactor, test, docs, security
Scopes: server, client, crypto, webrtc, infra
```

## Pull Request Process

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests locally
5. Submit a pull request with:
   - Clear description of changes
   - Screenshots (for UI changes)
   - Testing instructions

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
