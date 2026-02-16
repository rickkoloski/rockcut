# Test Results: D10 User Management

**Date:** 2026-02-15
**Tester:** Test Agent
**Verdict:** FAIL

---

## Test Results

| # | Test Case | Result | Notes |
|---|-----------|--------|-------|
| 1 | Admin Login & Nav | PASS | Matt already logged in. AppBar shows "Matt", nav shows "Users" item, all nav items present (Home, Brands & Recipes, Ingredient Library, Batches, Settings, Users) |
| 2 | Users Page | PASS | Breadcrumbs show "Home / Settings / Users", "ADD USER" button present, DataGrid shows Matt (Admin, Active, 2/15/2026) and Staff User (User, Active, 2/15/2026) |
| 3 | Create User | PASS | Created "Brewer Joe" with email joe@rockcut.com, password brew1234, role User. New user appears in grid with correct role and active status |
| 4 | Edit User | PASS | Clicked Joe's row, edit dialog opened with pre-filled values. Changed name to "Joe Brewer", left password blank. Name successfully updated in grid |
| 5 | Reset Password | PASS | Clicked Joe's row, scrolled to see "RESET PASSWORD" button, clicked it. Temp password dialog appeared with password "y3g2vvr1" and copy button. Instructions confirm user must change on next login |
| 6 | Password Change Gate | FAIL | Logged out and attempted to log in as joe@rockcut.com with temp password "y3g2vvr1" - login failed (form cleared but stayed on login page). Also tried original password "brew1234" - also failed. **BUG: User login not working for created users** |
| 7 | Regular User Role Enforcement | BLOCKED | Cannot test - depends on Test Case 6 |
| 8 | Deactivate User | PASS | Logged back in as Matt, clicked Joe's row, unchecked "Active" checkbox, saved. Joe now shows "Inactive" chip (gray) in grid |
| 9 | Inactive User Rejection | BLOCKED | Cannot test - depends on successful login from Test Case 6 |
| 10 | Existing Features | PASS | All existing pages load correctly: Brands & Recipes (shows 2 brands), Ingredient Library (shows ingredients with category filter), Batches (shows B001), Settings (shows ingredient categories) |

## Screenshots

1. **Dashboard (Initial State)** - Matt logged in, Users nav item visible, Active Batches grid showing B001
2. **Users Page** - Breadcrumbs, ADD USER button, grid with 2 users (Matt as Admin, Staff User as User)
3. **Add User Dialog (Filled)** - Form filled with Brewer Joe, joe@rockcut.com, password masked, Role=User
4. **Users Grid After Create** - Brewer Joe appears at top of grid with User role chip and Active chip
5. **Edit User Dialog** - Pre-filled with "Brewer Joe", helper text shows "Leave blank to keep current password"
6. **Edit User Dialog (Updated)** - Name changed to "Joe Brewer"
7. **Users Grid After Edit** - Name successfully updated to "Joe Brewer"
8. **Edit User Dialog (Scrolled)** - Shows Active checkbox and RESET PASSWORD button
9. **Password Reset Dialog** - Shows temp password "y3g2vvr1" with copy button and instructions
10. **Login Page After Logout** - Standard login form
11. **Login Attempt (Joe/temp password)** - Form cleared but stayed on login page (failed)
12. **Login Attempt (Joe/original password)** - Also failed
13. **Dashboard After Matt Login** - Matt successfully logged back in
14. **Edit User Dialog (Active Unchecked)** - Active checkbox unchecked for Joe
15. **Users Grid After Deactivate** - Joe shows "Inactive" chip
16. **Brands & Recipes Page** - Shows Altruism and Rockcut IPA brands
17. **Ingredient Library Page** - Shows ingredients with search and category filter
18. **Batches Page** - Shows B001 batch with status filter
19. **Settings Page** - Shows ingredient categories (Grain, Extract, Hop, Yeast, Fruit)

## Navigation Paths

- **Users Page**: Click "Users" in sidebar nav → /settings/users
- **Add User Dialog**: Click "ADD USER" button on Users page
- **Edit User Dialog**: Click on user row in grid
- **Reset Password Dialog**: In Edit User dialog, scroll down and click "RESET PASSWORD" button
- **Brands & Recipes**: Click "Brands & Recipes" in sidebar nav → /brands
- **Ingredient Library**: Click "Ingredient Library" in sidebar nav → /ingredients
- **Batches**: Click "Batches" in sidebar nav → /batches
- **Settings**: Click "Settings" in sidebar nav → /settings

## Lessons Learned

### UI/UX Patterns
- Edit User dialog requires scrolling to see the Active checkbox and RESET PASSWORD button (not visible on initial open)
- Temp password is generated and displayed in a nested dialog with copy functionality
- All CRUD forms follow consistent patterns (Add/Edit dialogs, DataGrid lists, search/filter controls)

### Testing Approach
- Admin functionality (user management CRUD) can be tested independently of regular user flows
- Password change gate and role enforcement require successful non-admin login
- Testing existing features after new feature implementation is critical to catch regressions

### Critical Bug Found
- **Users created through the UI cannot log in with either their original password or a reset password**
- This blocks testing of password change gate, role enforcement, and inactive user rejection flows
- Admin user (Matt) can still log in successfully, suggesting the issue is specific to newly created users
- Bug likely in user creation/password hashing or token generation logic

## Bugs Found

### Bug 1: Created Users Cannot Log In
**Severity:** Critical
**Description:** Users created through the "Add User" dialog cannot log in to the application.

**Steps to Reproduce:**
1. As admin, create a new user (name: "Brewer Joe", email: joe@rockcut.com, password: brew1234)
2. User appears successfully in the grid
3. Log out as admin
4. Attempt to log in as joe@rockcut.com with password "brew1234"

**Expected:** Login succeeds and user is taken to dashboard

**Actual:** Login form clears but stays on login page (login rejected)

**Additional Testing:**
- Reset Joe's password via admin UI (temp password: y3g2vvr1)
- Attempted login with temp password also failed

**Impact:** Blocks Test Cases 6, 7, 9 (password change gate, role enforcement, inactive user rejection)

**Note:** Pre-existing user "matt@rockcut.com" can log in successfully, indicating the auth system works but user creation may have an issue with password hashing or token generation

**Suggested Investigation Areas:**
1. Check if `Accounts.create_user/1` is hashing the password correctly
2. Verify that `must_change_password` flag is being set appropriately on creation vs. reset
3. Check if auth tokens are being generated correctly for new users
4. Compare seed data (Matt's user record) vs. UI-created users in the database

## Summary

**Tests Run:** 10 test cases
**Passed:** 7 (Admin login, Users page, Create user, Edit user, Reset password, Deactivate user, Existing features)
**Failed:** 1 (Password change gate)
**Blocked:** 2 (Regular user role enforcement, Inactive user rejection)

**Critical Issue:** User login functionality is broken for newly created users, blocking 3 test cases that require logging in as a non-admin user. The admin/user role features, user CRUD operations, and password reset UI all work correctly, but the authentication flow for created users fails.

**What Works:**
- Admin login and navigation
- User management CRUD (create, edit, deactivate)
- Password reset UI (generates temp password)
- Active/Inactive status management
- Role assignment (Admin vs. User)
- All existing features (Brands, Ingredients, Batches, Settings) still work correctly

**What's Broken:**
- Login for newly created users (both original password and reset password fail)
- Password change gate cannot be tested due to login failure
- Role enforcement for regular users cannot be tested due to login failure
- Inactive user rejection cannot be tested due to login failure

**Recommendation:**
1. Fix the user login bug before deploying to production
2. Investigate user creation/password hashing logic
3. Check if password is being hashed correctly on creation and if auth tokens are being generated properly for new users
4. After fix, re-run Test Cases 6, 7, and 9 to validate password change gate, role enforcement, and inactive user rejection
