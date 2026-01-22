## Description
Please include a summary of the changes and the related issue.

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Security improvement
- [ ] Documentation update
- [ ] Refactoring (no functional changes)

## Related Issue
Fixes #(issue number)

## Security Checklist
⚠️ **CRITICAL**: This is a security-critical project. Before merging:

- [ ] Server cannot decrypt any messages
- [ ] Keys never appear in server logs
- [ ] No plaintext logging of user data
- [ ] Phone numbers are hashed before sending to server
- [ ] Private keys stored in Keystore, not AsyncStorage
- [ ] No hardcoded secrets or credentials
- [ ] All crypto operations use approved algorithms
- [ ] Code follows zero-trust principles

## Testing
Please describe the tests that you ran to verify your changes:
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manually tested on:
  - [ ] Android device/emulator
  - [ ] Server endpoint
- [ ] Tested security implications

## Checklist
- [ ] My code follows the project's style guidelines
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
- [ ] Any dependent changes have been merged and published

## Screenshots (if applicable)
Before:
[Before screenshot]

After:
[After screenshot]

## Additional Notes
Any additional information that reviewers should know.
