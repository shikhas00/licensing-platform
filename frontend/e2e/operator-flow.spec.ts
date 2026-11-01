import { test, expect } from "@playwright/test";

test.describe("Operator Flow", () => {
  test.beforeEach(async ({ page }) => {
    // Login as operator
    await page.goto("/login");
    await page.fill("#userId", "operator1");
    // Operator is selected by default, just click Continue
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("/operator/applications");
  });

  test("can create a new application", async ({ page }) => {
    await page.click('a:has-text("New Application")');
    await expect(page).toHaveURL("/operator/applications/new");

    // Fill out the form
    await page.fill("#business_name", "Test Restaurant");
    await page.selectOption("#business_type", "restaurant");
    await page.fill("#contact_name", "John Doe");
    await page.fill("#contact_email", "john@test.com");
    await page.fill("#contact_phone", "555-1234");
    await page.fill("#address", "123 Main St, City, State 12345");

    // Submit
    await page.click('button:has-text("Create Application")');

    // Should redirect to application detail
    await page.waitForURL(/\/operator\/applications\/\d+/);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1:has-text('Test Restaurant')")).toBeVisible();
  });

  test("can view application list", async ({ page }) => {
    await expect(page.locator("h1")).toContainText("My Applications");
  });

  test("can view application details", async ({ page }) => {
    // Create an application first
    await page.click('a:has-text("New Application")');
    await page.fill("#business_name", "Detail Test Business");
    await page.click('button:has-text("Create Application")');
    await page.waitForURL(/\/operator\/applications\/\d+/);
    await page.waitForLoadState("networkidle");

    // Check details are shown
    await expect(page.locator("h1:has-text('Detail Test Business')")).toBeVisible();
    await expect(page.locator("h2:has-text('Business Information')")).toBeVisible();
    await expect(page.locator("h2:has-text('Documents')")).toBeVisible();
  });

  test("can edit application in Application Received status", async ({ page }) => {
    // Create application with all fields filled
    await page.click('a:has-text("New Application")');
    await page.fill("#business_name", "Editable Business");
    await page.selectOption("#business_type", "restaurant");
    await page.fill("#contact_name", "Test User");
    await page.fill("#contact_email", "test@example.com");
    await page.fill("#contact_phone", "555-0000");
    await page.fill("#address", "123 Test St");
    await page.click('button:has-text("Create Application")');
    await page.waitForURL(/\/operator\/applications\/\d+/);
    await page.waitForLoadState("networkidle");

    // Click Edit button (it's a button styled as a link)
    await page.click('button:has-text("Edit")');
    await page.waitForTimeout(300);

    // Should show edit form - find the first input which is business name
    const businessNameInput = page.locator('input[type="text"]').first();
    await expect(businessNameInput).toBeVisible();

    // Clear and fill the business name
    await businessNameInput.fill("Updated Business Name");

    // Save changes
    await page.click('button:has-text("Save Changes")');

    // Wait for edit mode to close (Edit button reappears)
    await page.waitForLoadState("networkidle");
    await expect(page.locator('button:has-text("Edit")')).toBeVisible({ timeout: 10000 });

    // Verify change was saved - check h1 which shows business name
    await expect(page.locator("h1:has-text('Updated Business Name')")).toBeVisible();
  });
});
