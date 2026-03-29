# Testing Guide

This document explains the testing setup and how to run tests for the CounterPro web application.

## 🧪 Testing Stack

- **Test Runner**: Vitest
- **React Testing**: @testing-library/react
- **User Interactions**: @testing-library/user-event
- **DOM Assertions**: @testing-library/jest-dom
- **Coverage**: @vitest/coverage-v8

## 📋 Available Test Scripts

```bash
# Run all tests once
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run tests with UI interface
npm run test:ui

# Type checking
npm run type-check

# Linting
npm run lint

# Pre-commit checks (tests + lint)
npm run pre-commit
```

## 🎯 Test Structure

```
web/
├── lib/
│   └── __tests__/           # Utility function tests
│       ├── email-pipeline.test.ts
│       ├── constants.test.ts
│       └── setup.ts          # Test setup and mocks
├── app/
│   ├── deal/
│   │   └── __tests__/       # Component tests
│   ├── dashboard/
│   │   └── __tests__/       # Component tests
│   └── api/
│       └── stripe/
│           └── checkout/
│               └── __tests__/ # API route tests
└── .github/
    └── workflows/
        └── ci.yml           # GitHub Actions CI
```

## 🔧 Configuration

### Vitest Configuration
- **Environment**: jsdom for React component testing
- **Coverage**: 80% threshold for branches, functions, lines, statements
- **Setup**: Automatic mocks for Stripe, Clerk, Next.js router

### Test Environment Variables
Tests automatically mock these environment variables:
- `NEXT_PUBLIC_APP_URL`: http://localhost:3000
- `STRIPE_SECRET_KEY`: sk_test_123
- `STRIPE_*_PRICE_ID`: price_test_*

## 🚀 Running Tests Locally

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Run tests**:
   ```bash
   npm run test
   ```

3. **Watch mode during development**:
   ```bash
   npm run test:watch
   ```

4. **Coverage report**:
   ```bash
   npm run test:coverage
   # View coverage report: open coverage/index.html
   ```

## 🔄 CI/CD Integration

### GitHub Actions
Tests run automatically on:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches

### Vercel Deployment
Tests are **mandatory** before deployment:
- Build command: `npm run vercel-build`
- This runs: `npm run test && next build`
- Deployment fails if tests fail

## 📝 Writing Tests

### Component Tests
```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import MyComponent from "../component";

describe("MyComponent", () => {
  it("renders correctly", () => {
    render(<MyComponent />);
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });
});
```

### API Route Tests
```ts
import { describe, it, expect, vi } from "vitest";
import { POST } from "../route";

describe("API Route", () => {
  it("returns correct response", async () => {
    const request = new Request("http://localhost:3000/api/route", {
      method: "POST",
      body: JSON.stringify({ data: "test" }),
    });
    
    const response = await POST(request);
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });
});
```

## 🎯 Coverage Requirements

- **Global Coverage**: 80% minimum
- **Coverage Reports**: Text, JSON, HTML
- **Excluded from coverage**:
  - `node_modules/`
  - `**/*.d.ts`
  - `**/*.config.*`
  - `**/__tests__/**`

## 🐛 Debugging Tests

1. **Use console.log** in tests
2. **Run specific test file**:
   ```bash
   npm test app/deal/__tests__/page.test.tsx
   ```
3. **Use VS Code debugger** with Vitest extension
4. **Check test output** for detailed error messages

## 📊 Coverage Reports

After running `npm run test:coverage`:
- **Terminal**: Text summary
- **File**: `coverage/lcov.info`
- **HTML**: `coverage/index.html` (interactive report)

## 🔧 Mocks

### Automatic Mocks
- **Stripe**: Mocked with fake responses
- **Clerk**: Mocked user authentication
- **Next.js Router**: Mocked navigation functions
- **Fetch API**: Mocked for API calls

### Custom Mocks
```tsx
// In your test file
vi.mock("@/lib/my-module", () => ({
  myFunction: vi.fn(() => "mocked result"),
}));
```

## 🚨 Common Issues

### 1. Test Environment Issues
- Ensure `jsdom` environment for React tests
- Check setup file for proper mocks

### 2. Async Test Issues
- Use `waitFor` for DOM updates
- Use proper async/await syntax

### 3. Mock Issues
- Clear mocks in `beforeEach`
- Use correct mock return values

### 4. Coverage Issues
- Check excluded files in config
- Ensure all critical paths are tested

## 📚 Resources

- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro)
- [Jest DOM Matchers](https://github.com/testing-library/jest-dom)
- [Vercel Deployment](https://vercel.com/docs/concepts/projects/overview)

## 🤝 Contributing

1. Write tests for new features
2. Maintain 80% coverage
3. Follow existing test patterns
4. Run `npm run pre-commit` before committing
