import { test, expect } from "@playwright/test";
import { submitApplication } from "./helpers/submission";

test.describe("Resubmission Flow", () => {
  test("full resubmission cycle: operator -> officer -> operator", async ({ page }) => {
    const businessName = `Resubmit Test ${Date.now()}`;

    // Step 1: Operator creates application
    await page.goto("/login");
    await page.fill("#userId", "operator1");
    await page.click('button[type="submit"]');

    await page.click('a:has-text("New Application")');
    await page.fill("#business_name", businessName);
    await page.selectOption("#business_type", "restaurant");
    await page.fill("#contact_name", "Test User");
    await page.fill("#contact_email", "test@example.com");
    await page.fill("#contact_phone", "555-0000");
    await page.fill("#address", "123 Test St");
    await page.click('button:has-text("Create Application")');

    // Wait for redirect and get application ID
    await page.waitForURL(/\/operator\/applications\/\d+/);
    await page.waitForLoadState("networkidle");
    const url = page.url();
    const appId = url.match(/\/applications\/(\d+)/)?.[1];
    if (!appId) {
      throw new Error(`Could not extract appId from URL: ${url}`);
    }

    await submitApplication(page);

    // Step 2: Officer reviews and requests resubmission
    await page.goto("/login");
    await page.fill("#userId", "officer1");
    await page.click('button:has-text("Officer")');
    await page.click('button[type="submit"]');

    await page.click(`a[href="/officer/applications/${appId}"]`);

    // Set to Under Review first using modal
    await page.click('button:has-text("Change Status")');
    await page.click('button:has-text("Under Review")');
    await page.click('button:has-text("Update Status")');
    await page.waitForTimeout(500);

    // Add a comment explaining what's needed
    await page.fill('textarea[placeholder="Enter your feedback..."]', "Please upload your business license document.");
    await page.click('button:has-text("Add Comment")');
    await page.waitForTimeout(500);

    // Request resubmission via modal
    await page.click('button:has-text("Change Status")');
    await page.click('button:has-text("Pending Pre-Site Resubmission")');
    await page.click('button:has-text("Update Status")');
    await expect(page.locator("text=Pending Pre-Site Resubmission").first()).toBeVisible();

    // Step 3: Operator sees the feedback and resubmits
    await page.goto("/login");
    await page.fill("#userId", "operator1");
    await page.click('button[type="submit"]');

    await page.click(`a[href="/operator/applications/${appId}"]`);

    // Should see the pending status
    await expect(page.locator("text=Pending Pre-Site Resubmission").first()).toBeVisible();

    // Should see the officer's comment (use .first() since it appears in multiple places)
    await expect(page.locator("text=Please upload your business license").first()).toBeVisible();

    // Edit and save changes
    await page.click('button:has-text("Edit")');
    await page.waitForTimeout(300);

    // Find the business name input (first text input in the edit form)
    const businessNameInput = page.locator('input[type="text"]').first();
    await expect(businessNameInput).toBeVisible();
    await businessNameInput.fill(`${businessName} - Updated`);
    await page.click('button:has-text("Save Changes")');
    await page.waitForLoadState("networkidle");

    // Now click Resubmit Application to actually submit the changes
    await page.click('button:has-text("Resubmit Application")');
    await page.waitForLoadState("networkidle");

    // Status should change to Resubmitted
    await expect(page.locator("text=Pre-Site Resubmitted").first()).toBeVisible({ timeout: 10000 });

    // Step 4: Officer can see the resubmission
    await page.goto("/login");
    await page.fill("#userId", "officer1");
    await page.click('button:has-text("Officer")');
    await page.click('button[type="submit"]');

    // The application should appear in "Needs Review" filter
    await page.click('button:has-text("Needs Review")');
    await expect(page.locator(`text=${businessName}`).first()).toBeVisible();
  });

  test("operator cannot edit when application is Under Review", async ({ page }) => {
    // Create application
    await page.goto("/login");
    await page.fill("#userId", "operator1");
    await page.click('button[type="submit"]');

    await page.click('a:has-text("New Application")');
    await page.fill("#business_name", `No Edit Test ${Date.now()}`);
    await page.click('button:has-text("Create Application")');

    // Wait for redirect and get application ID
    await page.waitForURL(/\/operator\/applications\/\d+/);
    await page.waitForLoadState("networkidle");
    const url = page.url();
    const appId = url.match(/\/applications\/(\d+)/)?.[1];
    if (!appId) {
      throw new Error(`Could not extract appId from URL: ${url}`);
    }

    await submitApplication(page);

    // Officer sets to Under Review via modal
    await page.goto("/login");
    await page.fill("#userId", "officer1");
    await page.click('button:has-text("Officer")');
    await page.click('button[type="submit"]');

    await page.click(`a[href="/officer/applications/${appId}"]`);
    await page.click('button:has-text("Change Status")');
    await page.click('button:has-text("Under Review")');
    await page.click('button:has-text("Update Status")');

    // Operator tries to edit
    await page.goto("/login");
    await page.fill("#userId", "operator1");
    await page.click('button[type="submit"]');

    await page.click(`a[href="/operator/applications/${appId}"]`);

    // Edit button should not be visible when application is Under Review
    // canUpload is false for Under Review status, so Edit button isn't rendered
    await expect(page.locator('button:has-text("Edit")')).toHaveCount(0);
  });
});
