# D10: User Management — Test Plan

**Feature:** Multi-user auth with admin/user roles, user CRUD, password reset flow
**URL:** http://localhost:5174
**API:** http://localhost:4002

---

## Test Cases

### 1. Admin Login & Nav
- Log out if already logged in
- Log in as matthewheiser@gmail.com / rockcut2026
- Verify AppBar shows "Matt" (not email)
- Verify nav shows "Users" item
- Verify all other nav items still present (Home, Brands & Recipes, Ingredient Library, Batches, Settings)

### 2. Users Page
- Click "Users" in nav
- Verify PageHeader shows breadcrumbs: Home > Settings > Users
- Verify "Add User" button present
- Verify DataGrid shows at least Matt's row with columns: Name, Email, Role, Active, Created
- Verify Matt shows as "Admin" role chip and "Active" chip

### 3. Create User
- Click "Add User"
- Fill: Name="Brewer Joe", Email="joe@rockcut.com", Password="brew1234", Role=User
- Submit
- Verify new user appears in grid
- Verify grid shows correct role and active status

### 4. Edit User
- Click on Brewer Joe's row
- Verify edit dialog opens with pre-filled values
- Change name to "Joe Brewer"
- Leave password blank (should keep existing)
- Submit
- Verify name updated in grid

### 5. Reset Password
- Click on Joe Brewer's row
- Click "Reset Password" button
- Verify temp password dialog appears with a copyable password
- Note the temp password
- Close dialogs

### 6. Password Change Gate
- Log out
- Log in as joe@rockcut.com with the temp password from step 5
- Verify "Please Update Your Password" dialog appears (blocking)
- Enter new password "newbrew2026" in both fields
- Submit
- Verify dialog closes and app is accessible
- Verify nav does NOT show "Users" (Joe is a regular user)

### 7. Regular User Role Enforcement
- While logged in as Joe, try navigating to /settings/users
- Verify the page loads but API returns 403 (empty grid or error)

### 8. Deactivate User
- Log out, log in as matthewheiser@gmail.com / rockcut2026
- Go to Users page
- Click Joe's row
- Uncheck "Active" checkbox
- Submit
- Verify Joe shows "Inactive" chip

### 9. Inactive User Rejection
- Log out
- Try logging in as joe@rockcut.com / newbrew2026
- Verify login succeeds but subsequent API calls are rejected (401)
- App should redirect to login

### 10. Existing Features
- Log in as Matt
- Verify Brands & Recipes, Ingredient Library, Batches, Settings all still load correctly
