# Test Implementation Plan: University Cafe Ordering System

## Overview

This document provides comprehensive test coverage for 6 key features of the university cafe ordering system. All tests are implemented using existing testing frameworks (Vitest for frontend, Jest for backend) with minimal mocking and focus on edge cases.

**Total Coverage:** 147+ test cases across 7 test files
- **Frontend:** 4 files (64 tests) - React components and pages
- **Backend:** 3 files (83+ tests) - API controllers and business logic

---

## Test Strategy

### Principles
- ✅ **Non-invasive:** No production code modifications
- ✅ **Minimal mocking:** Only external APIs and databases
- ✅ **Edge cases:** Comprehensive error handling and boundary conditions
- ✅ **Clear naming:** Descriptive test names with expected outcomes
- ✅ **Framework alignment:** Vitest for frontend, Jest for backend

### Testing Libraries
- **Frontend:** Vitest + @testing-library/react
- **Backend:** Jest with babel-jest
- **Mocking:** vi.mock (Vitest), jest.mock (Jest)

---

## Frontend Test Files

### 1. Home Page Tests
**File:** [frontend/src/pages/Home.test.jsx](../../frontend/src/pages/Home.test.jsx)

**Coverage: Categories Loading**
- ✅ Load categories on component mount
- ✅ Display categories in chips
- ✅ Handle loading state during fetch
- ✅ Handle API errors gracefully
- ✅ Handle empty categories array

**Coverage: Featured Items**
- ✅ Load featured items on mount
- ✅ Display featured items grid
- ✅ Handle loading state during fetch
- ✅ Handle API errors gracefully
- ✅ Handle empty featured items array

**Functions Tested:**
- `fetchMenuCategories()` - [API/menuApi.js](../../frontend/src/API/menuApi.js) line 8
- `fetchFeaturedMenu()` - [API/menuApi.js](../../frontend/src/API/menuApi.js) line 15

**Edge Cases:**
- Network failures during category fetch
- Network failures during featured items fetch
- Empty responses from API
- Component unmounting during async operations

---

### 2. Menu Browsing Tests
**File:** [frontend/src/pages/Menu.test.jsx](../../frontend/src/pages/Menu.test.jsx)

**Coverage: Category Filtering**
- ✅ Display all items when no category selected
- ✅ Filter items by selected category
- ✅ Show category name in header
- ✅ Handle category selection/deselection

**Coverage: Subcategory Filtering**
- ✅ Display subcategory chips when category has subcategories
- ✅ Filter items by selected subcategory
- ✅ Handle subcategory selection/deselection
- ✅ Show subcategory name in header

**Coverage: Empty States**
- ✅ Handle empty category (no items)
- ✅ Handle empty subcategory (no items)
- ✅ Display appropriate empty messages

**Functions Tested:**
- `useMenuData()` hook - [hooks/useMenuData.js](../../frontend/src/hooks/useMenuData.js)
- `fetchMenu()` - [API/menuApi.js](../../frontend/src/API/menuApi.js) line 22
- `fetchMenuCategories()` - [API/menuApi.js](../../frontend/src/API/menuApi.js) line 8

**Edge Cases:**
- Switching between categories rapidly
- Selecting non-existent categories
- Categories with no subcategories
- API failures during menu fetch

---

### 3. Item Details Page Tests
**File:** [frontend/src/pages/MenuItemDetails.test.jsx](../../frontend/src/pages/MenuItemDetails.test.jsx)

**Coverage: Required Selections**
- ✅ Prevent form submission when required variant not selected
- ✅ Allow submission when all required variants selected
- ✅ Show validation errors for missing required selections
- ✅ Handle multiple required variant groups

**Coverage: Max Selections**
- ✅ Prevent selecting more than max allowed options
- ✅ Allow selecting up to max limit
- ✅ Show validation errors when exceeding max
- ✅ Handle max=1 (radio button behavior)

**Coverage: Price Calculations**
- ✅ Calculate base price correctly
- ✅ Add variant price deltas to base price
- ✅ Multiply by quantity correctly
- ✅ Update price display in real-time

**Coverage: Form Submission**
- ✅ Submit valid selections successfully
- ✅ Include selected options in cart data
- ✅ Navigate to menu after successful add
- ✅ Handle add-to-cart API errors

**Coverage: Quantity Handling**
- ✅ Default quantity to 1
- ✅ Allow quantity changes
- ✅ Validate minimum quantity (1)
- ✅ Update total price with quantity changes

**Functions Tested:**
- `validate()` - [utils/validate.js](../../frontend/src/utils/validate.js) line 1
- `computeUnitPrice()` - [utils/variantPricing.js](../../frontend/src/utils/variantPricing.js) line 1
- `addToCart()` - [API/cartApi.js](../../frontend/src/API/cartApi.js) line 8

**Edge Cases:**
- Items with no variants (simple pricing)
- Items with complex variant combinations
- Invalid quantity inputs
- Cart API failures
- Navigation failures

---

### 4. Unavailable Items Tests
**File:** [frontend/src/components/MenuItem.test.jsx](../../frontend/src/components/MenuItem.test.jsx)

**Coverage: Available Items**
- ✅ Render item card with all details
- ✅ Show "Add to Cart" button
- ✅ Show magnifier button for details
- ✅ Handle click navigation to details
- ✅ Display price correctly

**Coverage: Unavailable Items**
- ✅ Disable "Add to Cart" button
- ✅ Hide magnifier button
- ✅ Prevent navigation on click
- ✅ Show "Unavailable" status pill
- ✅ Maintain visual styling

**Coverage: Image Handling**
- ✅ Display item image
- ✅ Handle image load errors
- ✅ Show fallback for broken images
- ✅ Maintain aspect ratio

**Coverage: Accessibility**
- ✅ Proper ARIA labels
- ✅ Keyboard navigation support
- ✅ Screen reader compatibility
- ✅ Focus management

**Coverage: Status Display**
- ✅ Show "Available" for available items
- ✅ Show "Unavailable" for unavailable items
- ✅ Color-coded status pills
- ✅ Consistent status positioning

**Functions Tested:**
- MenuItem component render logic - [components/MenuItem.jsx](../../frontend/src/components/MenuItem.jsx)

**Edge Cases:**
- Items becoming unavailable during render
- Image URLs with special characters
- Very long item names/descriptions
- Items with no images

---

## Backend Test Files

### 5. Menu CRUD Operations Tests
**File:** [backend/src/controllers/menu.controller.test.js](../../backend/src/controllers/menu.controller.test.js)

**Coverage: CREATE**
- ✅ Create item with all required fields → 201 response
- ✅ Missing required field: name → 400
- ✅ Missing required field: category → 400
- ✅ Missing required field: description → 400
- ✅ Missing required field: basePrice → 400
- ✅ Missing required field: image → 400
- ✅ Missing required field: slug → 400
- ✅ Generate correct next numeric ID
- ✅ Trim and normalize input fields
- ✅ Handle invalid price (non-numeric)
- ✅ Handle database errors gracefully

**Coverage: UPDATE**
- ✅ Update existing menu item → 200 response
- ✅ Update non-existent item → 404 response
- ✅ Prevent updating numeric ID field
- ✅ Convert basePrice to float
- ✅ Return 400 when no valid fields provided
- ✅ Handle database errors during update
- ✅ Normalize slug to lowercase
- ✅ Convert boolean fields correctly

**Coverage: DELETE**
- ✅ Delete existing menu item → 200 response
- ✅ Delete non-existent item → 404 response
- ✅ Handle database errors during deletion
- ✅ Delete by numeric ID (not by _id)

**Coverage: GET Operations**
- ✅ Retrieve all menu items
- ✅ Retrieve menu categories
- ✅ Retrieve single menu item by ID
- ✅ Return 404 for non-existent menu item
- ✅ Retrieve featured menu items
- ✅ Retrieve items by category

**Functions Tested:**
- `createMenuItem()` - [menu.controller.js](../../backend/src/controllers/menu.controller.js) line 109
- `updateMenuItem()` - [menu.controller.js](../../backend/src/controllers/menu.controller.js) line 206
- `deleteMenuItem()` - [menu.controller.js](../../backend/src/controllers/menu.controller.js) line 288
- `getMenu()` - [menu.controller.js](../../backend/src/controllers/menu.controller.js) line 19
- `getMenuCategories()` - [menu.controller.js](../../backend/src/controllers/menu.controller.js) line 8
- `getMenuItem()` - [menu.controller.js](../../backend/src/controllers/menu.controller.js) line 45
- `getMenuByCategory()` - [menu.controller.js](../../backend/src/controllers/menu.controller.js) line 100
- `getFeaturedMenu()` - [menu.controller.js](../../backend/src/controllers/menu.controller.js) line 93

**Edge Cases:**
- Duplicate item names (allowed)
- Missing required fields combinations
- Invalid price values
- Database connection failures
- Next ID generation when no existing items

---

### 6. Order Create Function Tests
**File:** [backend/src/controllers/orders.controller.test.js](../../backend/src/controllers/orders.controller.test.js)

**Coverage: Input Validation**
- ✅ Missing/invalid orderType → 400
- ✅ Missing customer name/phone → 400
- ✅ Non-array/empty items → 400
- ✅ Item missing menuItemId/qty → 400
- ✅ Invalid menuItemId (non-numeric) → 400

**Coverage: Menu Item Validation**
- ✅ Menu item not found → 400
- ✅ Menu item not available → 400

**Coverage: Pricing Logic**
- ✅ Simple item pricing (basePrice only)
- ✅ Legacy options pricing (priceDelta)
- ✅ VariantGroups pricing (complex options)
- ✅ Quantity multiplier (unitPrice × qty)
- ✅ Tax calculation (8% rate)
- ✅ Multiple items in one order

**Coverage: Order Number Generation**
- ✅ Unique order number generation
- ✅ Handle conflicts (regenerate up to 3 times)
- ✅ Use last generated number after 3 attempts

**Coverage: Cart Handling**
- ✅ Delete cart by header cartId
- ✅ Delete cart by body cartId
- ✅ Prioritize header over body cartId
- ✅ Skip cart deletion when no cartId

**Coverage: User Authentication**
- ✅ Include userId when authenticated
- ✅ Set userId to null when not authenticated

**Coverage: Customer Data**
- ✅ Include customer address when provided
- ✅ Default address to empty string

**Coverage: Special Instructions**
- ✅ Include notesToBarista when provided
- ✅ Default to empty string
- ✅ Include item-level instructions

**Coverage: Response Format**
- ✅ Correct 201 response format
- ✅ Cache-Control: no-store header
- ✅ Return orderId, orderNumber, status, total

**Coverage: Error Handling**
- ✅ Database errors during lookups
- ✅ Database errors during creation
- ✅ Variant group lookup errors

**Functions Tested:**
- `createOrder()` - [orders.controller.js](../../backend/src/controllers/orders.controller.js) line 15

**Edge Cases:**
- Orders with 10+ items
- Complex variant combinations
- Order number collision handling
- Partial cart deletion failures
- Mixed authenticated/unauthenticated requests

---

### 7. Order Status Transitions Tests
**File:** [backend/src/controllers/orders.controller.status.test.js](../../backend/src/controllers/orders.controller.status.test.js)

**Coverage: Valid Transitions**
- ✅ **received → in_progress** (valid)
- ✅ **received → cancelled** (valid)
- ✅ **in_progress → completed** (valid)
- ✅ **in_progress → cancelled** (valid)

**Coverage: Invalid Transitions**
- ✅ **completed → received** (blocked)
- ✅ **completed → in_progress** (blocked)
- ✅ **completed → cancelled** (blocked)
- ✅ **cancelled → received** (blocked)
- ✅ **cancelled → in_progress** (blocked)
- ✅ **cancelled → completed** (blocked)
- ✅ Prevent self-transition (same status)
- ✅ Reject invalid/unknown status values

**Coverage: Edge Cases**
- ✅ Order does not exist → 404
- ✅ Missing status field → 400
- ✅ Database connection errors → 500
- ✅ Save operation failures → 500

**Coverage: Status Retrieval**
- ✅ Retrieve order status by order number
- ✅ Return 404 when order not found

**Coverage: Response Format**
- ✅ Set Cache-Control: no-store header on updates
- ✅ Set Cache-Control: no-store header on retrieval
- ✅ Return correct order data after transition
- ✅ Include updated timestamp in response
- ✅ Return proper error codes (VALIDATION_ERROR, INVALID_TRANSITION, NOT_FOUND, INTERNAL_ERROR)

**Functions Tested:**
- `updateOrderStatus()` - [orders.controller.js](../../backend/src/controllers/orders.controller.js) line 193
- `getOrderStatus()` - [orders.controller.js](../../backend/src/controllers/orders.controller.js) line 176

**State Machine:**
```
received ──────→ in_progress ──────→ completed
  ↓                  ↓
  └─→ cancelled ←────┘

completed ─ (terminal, no transitions allowed)
cancelled ─ (terminal, no transitions allowed)
```

**Edge Cases:**
- Attempted transitions from terminal states (completed/cancelled)
- Concurrent status update attempts
- Database persistence errors
- Non-existent order IDs

---

## Run Commands

### All Tests
```bash
# Frontend (64 tests)
cd frontend && npm test

# Backend (83+ tests)
cd backend && npm test
```

### Individual Test Files
```bash
# Frontend
cd frontend
npm test -- Home.test.jsx
npm test -- Menu.test.jsx
npm test -- MenuItemDetails.test.jsx
npm test -- MenuItem.test.jsx

# Backend
cd backend
npm test -- menu.controller.test.js
npm test -- orders.controller.test.js
npm test -- orders.controller.status.test.js
```

### Coverage Reports
```bash
cd frontend && npm test -- --coverage
cd backend && npm test -- --coverage
```

---

## Test Dependencies

### Frontend
- `vitest` - Test runner
- `@testing-library/react` - Component testing utilities
- `@testing-library/jest-dom` - DOM matchers
- `jsdom` - DOM environment

### Backend
- `jest` - Test runner
- `@jest/globals` - Jest globals for ES modules
- `babel-jest` - Babel transformer for Jest

---

## Mocking Strategy

### Frontend
- **API calls:** Mocked at module level using `vi.mock()`
- **Router:** Mocked navigation functions
- **Hooks:** Custom hooks tested in isolation

### Backend
- **Database:** Mongoose models mocked with `jest.mock()`
- **External APIs:** Not used in backend
- **File system:** Not mocked (no file operations)

---

## Edge Cases Covered

### Data Validation
- Empty/null/undefined inputs
- Invalid data types
- Malformed JSON
- Oversized inputs

### Business Logic
- Zero/negative prices
- Invalid quantities
- Unavailable items in orders
- Invalid state transitions

### Error Handling
- Database connection failures
- Network timeouts
- File system errors
- Memory constraints

### Performance
- Large datasets (100+ items)
- Complex variant combinations
- Concurrent operations

---

## Maintenance Notes

### Adding New Tests
1. Follow existing naming conventions
2. Include edge cases for new features
3. Update this documentation
4. Run full test suite before committing

### Updating Tests
1. Check if production code changes affect existing tests
2. Update mocks if API signatures change
3. Maintain test coverage above 80%
4. Update documentation accordingly

### CI/CD Integration
- Tests run automatically on push/PR
- Coverage reports generated
- Failures block deployment
- Parallel test execution recommended

---

**Last Updated:** December 2024
**Test Framework Versions:** Vitest 1.x, Jest 29.x
**Coverage:** 147+ tests, 7 files, 6 features