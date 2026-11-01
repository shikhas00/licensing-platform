import { test, expect } from "@playwright/test";
import { submitApplication } from "./helpers/submission";

test.describe("Officer Flow", () => {
  // Helper to create an application as operator first
  async function createApplicationAsOperator(page: import("@playwright/test").Page) {
    await page.goto("/login");
    await page.fill("#userId", "operator1");
    // Operator is default, just submit
    await page.click('button[type="submit"]');

    await page.click('a:has-text("New Application")');
    await page.fill("#business_name", `Test Business ${Date.now()}`);
    await page.selectOption("#business_type", "restaurant");
    await page.click('button:has-text("Create Application")');
    await page.waitForURL(/\/operator\/applications\/\d+/);
    await page.waitForLoadState("networkidle");

    // Get the application ID from URL
    const url = page.url();
    const match = url.match(/\/applications\/(\d+)/);
    if (!match) {
      throw new Error(`Could not extract appId from URL: ${url}`);
    }

    // Submit the application to create revision 1 snapshot
    await submitApplication(page);

    return match[1];
  }

  async function loginAsOfficer(page: import("@playwright/test").Page) {
    await page.goto("/login");
    await page.fill("#userId", "officer1");
    // Click officer role button
    await page.click('button:has-text("Officer")');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("/officer/queue");
  }

  test("can view review queue", async ({ page }) => {
    await loginAsOfficer(page);
    await expect(page.locator("h1")).toContainText("Review Queue");
    // Filter buttons should be visible
    await expect(page.locator('button:has-text("All")')).toBeVisible();
    await expect(page.locator('button:has-text("Needs Review")')).toBeVisible();
  });

  test("can review an application", async ({ page }) => {
    // First create an application as operator
    const appId = await createApplicationAsOperator(page);
    expect(appId).toBeTruthy();

    // Now login as officer
    await loginAsOfficer(page);

    // Click review on the application
    await page.click(`a[href="/officer/applications/${appId}"]`);
    await expect(page).toHaveURL(`/officer/applications/${appId}`);

    // Check review page elements
    await expect(page.locator("h2:has-text('Business Information')")).toBeVisible();
    await expect(page.locator("h2:has-text('Documents')")).toBeVisible();
    await expect(page.locator('button:has-text("Change Status")')).toBeVisible();
  });

  test("can change application status to Under Review", async ({ page }) => {
    const appId = await createApplicationAsOperator(page);
    await loginAsOfficer(page);

    await page.click(`a[href="/officer/applications/${appId}"]`);

    // Open status modal
    await page.click('button:has-text("Change Status")');

    // Select Under Review in the modal
    await page.click('button:has-text("Under Review")');

    // Confirm the change
    await page.click('button:has-text("Update Status")');

    // Verify status changed - check the status badge
    await expect(page.locator("text=Under Review").first()).toBeVisible();
  });

  test("can request resubmission", async ({ page }) => {
    const appId = await createApplicationAsOperator(page);
    await loginAsOfficer(page);

    await page.click(`a[href="/officer/applications/${appId}"]`);

    // First set to Under Review
    await page.click('button:has-text("Change Status")');
    await page.click('button:has-text("Under Review")');
    await page.click('button:has-text("Update Status")');
    await page.waitForTimeout(500);

    // Then request resubmission
    await page.click('button:has-text("Change Status")');
    await page.click('button:has-text("Pending Pre-Site Resubmission")');
    await page.click('button:has-text("Update Status")');

    // Verify status
    await expect(page.locator("text=Pending Pre-Site Resubmission").first()).toBeVisible();
  });

  test("can add a comment to application", async ({ page }) => {
    const appId = await createApplicationAsOperator(page);
    await loginAsOfficer(page);

    await page.click(`a[href="/officer/applications/${appId}"]`);

    // Find comment form and add a comment
    await page.fill('textarea[placeholder="Enter your feedback..."]', "Please provide more details about your business hours.");
    await page.click('button:has-text("Add Comment")');

    // Verify comment appears
    await expect(page.locator("text=Please provide more details")).toBeVisible();
  });

  test("filter buttons work correctly", async ({ page }) => {
    await loginAsOfficer(page);

    // Click different filters
    await page.click('button:has-text("Needs Review")');
    // The button should be active (different styling)
    await expect(page.locator('button:has-text("Needs Review")')).toHaveClass(/bg-blue-600/);

    await page.click('button:has-text("In Progress")');
    await expect(page.locator('button:has-text("In Progress")')).toHaveClass(/bg-amber-600/);

    await page.click('button:has-text("Completed")');
    await expect(page.locator('button:has-text("Completed")')).toHaveClass(/bg-green-600/);
  });
});
