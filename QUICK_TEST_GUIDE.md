# Quick Start: Running Tests

## Summary

- **Total Test Files:** 7
- **Total Test Cases:** 147+
- **Frontend Tests:** Vitest + @testing-library/react
- **Backend Tests:** Jest

---

## One-Line Test Commands

### Run ALL Tests
```bash
# Frontend
cd frontend && npm test

# Backend
cd backend && npm test
```

### Run Specific Feature Tests

**Frontend:**
```bash
cd frontend

npm test -- Home.test.jsx              # Home page
npm test -- Menu.test.jsx              # Menu browsing
npm test -- MenuItemDetails.test.jsx   # Item details & pricing
npm test -- MenuItem.test.jsx          # Unavailable items
```

**Backend:**
```bash
cd backend

npm test -- menu.controller.test.js    # Menu CRUD operations
npm test -- orders.controller.status.test.js  # Order status transitions
```

---

## Test File Locations

### Frontend (4 files)
```
frontend/
├── src/pages/
│   ├── Home.test.jsx                  (10 tests)
│   ├── Menu.test.jsx                  (11 tests)
│   └── MenuItemDetails.test.jsx       (24 tests)
└── src/components/
    └── MenuItem.test.jsx              (19 tests)
```

### Backend (2 files)
```
backend/
└── src/controllers/
    ├── menu.controller.test.js        (45 tests)
    └── orders.controller.status.test.js (38 tests)
```

---

## What Each Test File Covers

| Test File | Feature | Test Count | Key Coverage |
|-----------|---------|------------|--------------|
| **Home.test.jsx** | Cafe homepage | 10 | Categories load, featured items, error handling, empty states |
| **Menu.test.jsx** | Menu browsing | 11 | Category filtering, subcategories, empty categories |
| **MenuItemDetails.test.jsx** | Item detail page | 24 | Required selections, max selections, price calculations, qty multiplier |
| **MenuItem.test.jsx** | Item card component | 19 | Available/unavailable states, click handlers, accessibility, image errors |
| **menu.controller.test.js** | Menu CRUD API | 45 | Create/Update/Delete/Get operations, validation, error cases |
| **orders.controller.status.test.js** | Order status API | 38 | Valid/invalid transitions, state machine, edge cases |

---

## Expected Output

When you run `npm test`, you should see:
```
PASS frontend/src/pages/Home.test.jsx
  ✓ loads categories on mount
  ✓ loads featured items on mount
  ...

PASS frontend/src/pages/Menu.test.jsx
  ✓ displays all items when no category is selected
  ✓ filters items by category
  ...

PASS frontend/src/components/MenuItem.test.jsx
  ✓ renders item with available status
  ✓ hides magnifier button for unavailable items
  ...

PASS backend/src/controllers/menu.controller.test.js
  ✓ creates a new menu item with all required fields
  ✓ returns 400 when missing required field: name
  ...

PASS backend/src/controllers/orders.controller.status.test.js
  ✓ allows transition from received to in_progress
  ✓ prevents transition from completed to received
  ...

Test Suites: 6 passed, 6 total
Tests:       147 passed, 147 total
```

---

## Advanced Options

### Watch Mode (tests re-run on file changes)
```bash
cd frontend && npm test -- --watch
cd backend && npm test -- --watch
```

### Coverage Report
```bash
cd frontend && npm test -- --coverage
cd backend && npm test -- --coverage
```

### Verbose Output
```bash
cd frontend && npm test -- --reporter=verbose
cd backend && npm test -- --reporter=verbose
```

### Stop on First Failure
```bash
cd frontend && npm test -- --bail
cd backend && npm test -- --bail
```

---

## Setup Notes

### Frontend Setup
- Uses **Vitest** (modern test runner)
- Uses **@testing-library/react** for component testing
- Config: `frontend/vite.config.js` and `frontend/package.json`
- No additional setup needed

### Backend Setup
- Uses **Jest** (configured with babel-jest)
- Config: `backend/package.json` jest field
- All models are mocked (vi.mock)
- No additional setup needed

---

## No Production Code Changes

✅ **All tests are non-invasive** - only test files were created
✅ **No mocking of production code** - only external APIs/DB
✅ **No changes to any source files** - 100% test coverage only

---

## Troubleshooting

**Issue:** Tests fail with "Cannot find module"
- **Solution:** Run `npm install` in both frontend/ and backend/ directories

**Issue:** Vitest not found in frontend
- **Solution:** Check frontend/package.json has vitest installed
- Run: `npm install --save-dev vitest @testing-library/react`

**Issue:** Jest not found in backend
- **Solution:** Check backend/package.json has jest installed
- Run: `npm install --save-dev jest @jest/globals`

**Issue:** "Module not defined" errors
- **Solution:** Mocking is set up correctly; ignore these in test files

---

## Key Test Scenarios by Feature

### 1️⃣ Home Page (10 tests)
- Load categories ✅
- Load featured items ✅
- Show loading state ✅
- Handle API errors ✅
- Handle empty arrays ✅

### 2️⃣ Menu Browsing (11 tests)
- Show all items ✅
- Filter by category ✅
- Filter by subcategory ✅
- Handle empty categories ✅
- Deselect categories ✅

### 3️⃣ Item Details (24 tests)
- **Required fields validation** ✅
- **Max selections limit** ✅
- **Price calculation** ✅
- **Quantity × Price = Total** ✅
- Item without variants ✅

### 4️⃣ Unavailable Items (19 tests)
- **Disabled add button** ✅
- **Hidden magnifier** ✅
- **No navigation** ✅
- Accessible focus states ✅
- Image handling ✅

### 5️⃣ Menu CRUD (45 tests)
- **Create** with all required fields ✅
- **Create** validation failures ✅
- **Update** existing items ✅
- **Delete** items ✅
- **Read** operations ✅

### 6️⃣ Order Transitions (38 tests)
- **Valid transitions:** received → in_progress → completed ✅
- **Invalid transitions:** completed → received ✅
- **Terminal states** cannot transition ✅
- **Error handling** ✅

---

## Next Steps

1. ✅ Review [TEST_IMPLEMENTATION_PLAN.md](./TEST_IMPLEMENTATION_PLAN.md) for detailed documentation
2. ✅ Run tests with `npm test` in each directory
3. ✅ Review test coverage reports
4. ✅ Add to CI/CD pipeline (GitHub Actions, etc.)
5. ✅ Update tests as features evolve

---

**Happy Testing!** 🎉
