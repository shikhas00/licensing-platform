import { test, expect } from "@playwright/test";
import { submitApplication } from "./helpers/submission";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Tests for draft document functionality:
 * - Documents uploaded during pending resubmission are drafts
 * - Officers don't see draft documents until operator resubmits
 * - Resubmit Application button creates new revision and commits drafts
 * - Revision comparison shows what changed
 */

// Helper functions
async function loginAsOperator(
  page: import("@playwright/test").Page,
  userId = "operator1"
) {
  await page.goto("/login");
  await page.fill("#userId", userId);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL("/operator/applications");
}

async function loginAsOfficer(
  page: import("@playwright/test").Page,
  userId = "officer1"
) {
  await page.goto("/login");
  await page.fill("#userId", userId);
  await page.click('button:has-text("Officer")');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL("/officer/queue");
}

async function createApplication(
  page: import("@playwright/test").Page,
  businessName: string
): Promise<string> {
  await page.click('a:has-text("New Application")');
  await page.fill("#business_name", businessName);
  await page.selectOption("#business_type", "restaurant");
  await page.fill("#contact_name", "Test User");
  await page.fill("#contact_email", "test@example.com");
  await page.fill("#contact_phone", "555-0000");
  await page.fill("#address", "123 Test St");
  await page.click('button:has-text("Create Application")');
  await page.waitForURL(/\/operator\/applications\/\d+/);
  await page.waitForLoadState("networkidle");

  const url = page.url();
  const match = url.match(/\/applications\/(\d+)/);
  if (!match) throw new Error(`Could not extract appId from URL: ${url}`);

  // Submit the application to create revision 1 snapshot
  // This ensures revision history exists for comparison tests
  await submitApplication(page);

  return match[1];
}

async function setApplicationStatus(
  page: import("@playwright/test").Page,
  status: string
) {
  await page.click('button:has-text("Change Status")');
  await page.click(`button:has-text("${status}")`);
  await page.click('button:has-text("Update Status")');
  await page.waitForLoadState("networkidle");
}

async function addOfficerComment(
  page: import("@playwright/test").Page,
  comment: string
) {
  await page.fill('textarea[placeholder="Enter your feedback..."]', comment);
  await page.click('button:has-text("Add Comment")');
  await page.waitForLoadState("networkidle");
}

// Create a test PDF file for uploads
async function createTestPdf(): Promise<string> {
  const testDir = path.join(__dirname, "test-files");
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  const pdfPath = path.join(testDir, "valid_license.pdf");

  // Create a minimal valid PDF file
  const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>
endobj
xref
0 4
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
trailer
<< /Size 4 /Root 1 0 R >>
startxref
196
%%EOF`;

  fs.writeFileSync(pdfPath, pdfContent);
  return pdfPath;
}

// ============================================================================
// Resubmit Application Button Tests
// ============================================================================
test.describe("Resubmit Application Button", () => {
  test("Resubmit button appears when status is Pending Pre-Site Resubmission", async ({
    page,
  }) => {
    const businessName = `Resubmit Btn Test ${Date.now()}`;

    // Create application
    await loginAsOperator(page);
    const appId = await createApplication(page, businessName);


    // Officer sets to pending resubmission
    await loginAsOfficer(page);
    await page.click(`a[href="/officer/applications/${appId}"]`);
    await setApplicationStatus(page, "Under Review");
    await addOfficerComment(page, "Please upload business license");
    await setApplicationStatus(page, "Pending Pre-Site Resubmission");

    // Operator should see "Resubmit Application" button
    await loginAsOperator(page);
    await page.click(`a[href="/operator/applications/${appId}"]`);

    await expect(
      page.locator('button:has-text("Resubmit Application")')
    ).toBeVisible();
  });

  test("clicking Resubmit creates new revision", async ({ page }) => {
    const businessName = `Revision Create ${Date.now()}`;

    await loginAsOperator(page);
    const appId = await createApplication(page, businessName);


    // Check initial revision
    await expect(page.locator("p:has-text('Revision 1')")).toBeVisible();

    // Officer requests resubmission
    await loginAsOfficer(page);
    await page.click(`a[href="/officer/applications/${appId}"]`);
    await setApplicationStatus(page, "Under Review");
    await setApplicationStatus(page, "Pending Pre-Site Resubmission");

    // Operator makes changes and resubmits
    await loginAsOperator(page);
    await page.click(`a[href="/operator/applications/${appId}"]`);

    // Edit form
    await page.click('button:has-text("Edit")');
    await page.waitForTimeout(300);
    const businessNameInput = page.locator('input[type="text"]').first();
    await businessNameInput.fill(`${businessName} - Updated`);
    await page.click('button:has-text("Save Changes")');
    await page.waitForLoadState("networkidle");

    // Click Resubmit Application
    await page.click('button:has-text("Resubmit Application")');
    await page.waitForLoadState("networkidle");

    // Should now show Revision 2 in the header
    await expect(page.locator("p:has-text('Revision 2')")).toBeVisible({ timeout: 10000 });

    // Status should change to Pre-Site Resubmitted
    await expect(page.locator("text=Pre-Site Resubmitted").first()).toBeVisible();
  });

  test("Resubmit button changes status and notifies officer", async ({
    page,
  }) => {
    const businessName = `Status Change ${Date.now()}`;

    await loginAsOperator(page);
    const appId = await createApplication(page, businessName);

    // Officer requests resubmission
    await loginAsOfficer(page);
    await page.click(`a[href="/officer/applications/${appId}"]`);
    await setApplicationStatus(page, "Under Review");
    await setApplicationStatus(page, "Pending Pre-Site Resubmission");

    // Operator resubmits
    await loginAsOperator(page);
    await page.click(`a[href="/operator/applications/${appId}"]`);
    await page.click('button:has-text("Resubmit Application")');
    await page.waitForLoadState("networkidle");

    // Status should be Pre-Site Resubmitted
    await expect(page.locator("text=Pre-Site Resubmitted").first()).toBeVisible();

    // Officer should see it in Needs Review
    await loginAsOfficer(page);
    await page.click('button:has-text("Needs Review")');
    await expect(page.locator(`text=${businessName}`).first()).toBeVisible();
  });
});

// ============================================================================
// Draft Document Tests
// ============================================================================
test.describe("Draft Documents", () => {
  test("documents uploaded during pending resubmission are not immediately visible to officer", async ({
    page,
  }) => {
    const businessName = `Draft Doc Test ${Date.now()}`;
    const pdfPath = await createTestPdf();

    // Create application
    await loginAsOperator(page);
    const appId = await createApplication(page, businessName);

    // Officer requests resubmission
    await loginAsOfficer(page);
    await page.click(`a[href="/officer/applications/${appId}"]`);
    await setApplicationStatus(page, "Under Review");
    await addOfficerComment(page, "Please upload business license document");
    await setApplicationStatus(page, "Pending Pre-Site Resubmission");

    // Verify officer sees no documents
    await expect(page.locator('text=No document uploaded').first()).toBeVisible();

    // Operator uploads document (as draft)
    await loginAsOperator(page);
    await page.click(`a[href="/operator/applications/${appId}"]`);

    // Find the Business License upload area and upload file
    const businessLicenseSection = page
      .locator('h4:has-text("Business License")')
      .locator("..");
    const fileInput = businessLicenseSection.locator('input[type="file"]');

    await fileInput.setInputFiles(pdfPath);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000); // Wait for upload to complete

    // Operator should see the document
    await expect(
      businessLicenseSection.locator('text=valid_license.pdf')
    ).toBeVisible();

    // Officer should NOT see the document yet (it's a draft)
    await loginAsOfficer(page);
    await page.click(`a[href="/officer/applications/${appId}"]`);

    // The document section should still show "No document uploaded" for officer
    const officerBusinessLicenseSection = page
      .locator('h4:has-text("Business License")')
      .locator("..");
    await expect(
      officerBusinessLicenseSection.locator('text=No document uploaded')
    ).toBeVisible();
  });

  test("draft documents become visible after operator resubmits", async ({
    page,
  }) => {
    const businessName = `Draft Commit Test ${Date.now()}`;
    const pdfPath = await createTestPdf();

    // Create application
    await loginAsOperator(page);
    const appId = await createApplication(page, businessName);

    // Officer requests resubmission
    await loginAsOfficer(page);
    await page.click(`a[href="/officer/applications/${appId}"]`);
    await setApplicationStatus(page, "Under Review");
    await setApplicationStatus(page, "Pending Pre-Site Resubmission");

    // Operator uploads document
    await loginAsOperator(page);
    await page.click(`a[href="/operator/applications/${appId}"]`);

    const businessLicenseSection = page
      .locator('h4:has-text("Business License")')
      .locator("..");
    const fileInput = businessLicenseSection.locator('input[type="file"]');
    await fileInput.setInputFiles(pdfPath);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // Operator clicks Resubmit Application (commits the draft)
    await page.click('button:has-text("Resubmit Application")');
    await page.waitForLoadState("networkidle");

    // Officer should now see the document
    await loginAsOfficer(page);
    await page.click(`a[href="/officer/applications/${appId}"]`);

    const officerBusinessLicenseSection = page
      .locator('h4:has-text("Business License")')
      .locator("..");
    // Should see the uploaded document now
    await expect(
      officerBusinessLicenseSection.locator('text=valid_license.pdf')
    ).toBeVisible();
  });
});

// ============================================================================
// Revision Comparison Tests
// ============================================================================
test.describe("Revision Comparison", () => {
  test("officer sees changes between revisions", async ({ page }) => {
    const businessName = `Compare Revisions ${Date.now()}`;
    const updatedName = `${businessName} - Updated`;

    // Create application
    await loginAsOperator(page);
    const appId = await createApplication(page, businessName);

    // Officer requests resubmission
    await loginAsOfficer(page);
    await page.click(`a[href="/officer/applications/${appId}"]`);
    await setApplicationStatus(page, "Under Review");
    await setApplicationStatus(page, "Pending Pre-Site Resubmission");

    // Operator updates business name and resubmits
    await loginAsOperator(page);
    await page.click(`a[href="/operator/applications/${appId}"]`);

    await page.click('button:has-text("Edit")');
    await page.waitForTimeout(300);
    const businessNameInput = page.locator('input[type="text"]').first();
    await businessNameInput.fill(updatedName);
    await page.click('button:has-text("Save Changes")');
    await page.waitForLoadState("networkidle");

    await page.click('button:has-text("Resubmit Application")');
    await page.waitForLoadState("networkidle");

    // Officer views application
    await loginAsOfficer(page);
    await page.click(`a[href="/officer/applications/${appId}"]`);

    // Should see revision comparison section for revision 2
    await expect(page.locator("p:has-text('Revision 2')")).toBeVisible();

    // Revision comparison should show what changed - the heading includes revision number
    await expect(
      page.locator('h2:has-text("What Changed")')
    ).toBeVisible();

    // Should show form field changes
    await expect(page.locator("text=Form Changes")).toBeVisible();
  });

  test("revision comparison shows form field differences", async ({ page }) => {
    const businessName = `Field Diff Test ${Date.now()}`;

    await loginAsOperator(page);
    const appId = await createApplication(page, businessName);

    // Officer requests resubmission
    await loginAsOfficer(page);
    await page.click(`a[href="/officer/applications/${appId}"]`);
    await setApplicationStatus(page, "Under Review");
    await addOfficerComment(page, "Please update contact phone");
    await setApplicationStatus(page, "Pending Pre-Site Resubmission");

    // Operator updates phone and resubmits
    await loginAsOperator(page);
    await page.click(`a[href="/operator/applications/${appId}"]`);

    await page.click('button:has-text("Edit")');
    await page.waitForTimeout(300);

    // Update business name (simpler than finding phone input)
    const businessNameInput = page.locator('input[type="text"]').first();
    await businessNameInput.fill(`${businessName} - Phone Fixed`);

    await page.click('button:has-text("Save Changes")');
    await page.waitForLoadState("networkidle");

    await page.click('button:has-text("Resubmit Application")');
    await page.waitForLoadState("networkidle");

    // Officer views - should see what changed
    await loginAsOfficer(page);
    await page.click(`a[href="/officer/applications/${appId}"]`);

    // Should show changes from previous revision
    await expect(
      page.locator('h2:has-text("What Changed")')
    ).toBeVisible();
  });

  test("multiple revision rounds show incremental changes", async ({ page }) => {
    const businessName = `Multi Rev Compare ${Date.now()}`;

    await loginAsOperator(page);
    const appId = await createApplication(page, businessName);

    // === Round 1 ===
    await loginAsOfficer(page);
    await page.click(`a[href="/officer/applications/${appId}"]`);
    await setApplicationStatus(page, "Under Review");
    await setApplicationStatus(page, "Pending Pre-Site Resubmission");

    await loginAsOperator(page);
    await page.click(`a[href="/operator/applications/${appId}"]`);
    await page.click('button:has-text("Edit")');
    await page.waitForTimeout(300);
    await page.locator('input[type="text"]').first().fill(`${businessName} v2`);
    await page.click('button:has-text("Save Changes")');
    await page.waitForLoadState("networkidle");
    await page.click('button:has-text("Resubmit Application")');
    await page.waitForLoadState("networkidle");

    await expect(page.locator("p:has-text('Revision 2')")).toBeVisible({ timeout: 10000 });

    // === Round 2 ===
    await loginAsOfficer(page);
    await page.click(`a[href="/officer/applications/${appId}"]`);
    await setApplicationStatus(page, "Pending Pre-Site Resubmission");

    await loginAsOperator(page);
    await page.click(`a[href="/operator/applications/${appId}"]`);
    await page.click('button:has-text("Edit")');
    await page.waitForTimeout(300);
    await page.locator('input[type="text"]').first().fill(`${businessName} v3`);
    await page.click('button:has-text("Save Changes")');
    await page.waitForLoadState("networkidle");
    await page.click('button:has-text("Resubmit Application")');
    await page.waitForLoadState("networkidle");

    await expect(page.locator("p:has-text('Revision 3')")).toBeVisible({ timeout: 10000 });

    // Officer should see comparison for v3 vs v2
    await loginAsOfficer(page);
    await page.click(`a[href="/officer/applications/${appId}"]`);

    await expect(
      page.locator('h2:has-text("What Changed")')
    ).toBeVisible();
    await expect(page.locator("p:has-text('Revision 3')")).toBeVisible();
  });
});

// ============================================================================
// Edit vs Resubmit Flow Tests
// ============================================================================
test.describe("Edit vs Resubmit Flow", () => {
  test("Save Changes does not create revision - only Resubmit does", async ({
    page,
  }) => {
    const businessName = `Edit No Rev ${Date.now()}`;

    await loginAsOperator(page);
    const appId = await createApplication(page, businessName);

    // Check initial revision
    await expect(page.locator("p:has-text('Revision 1')")).toBeVisible();

    // Officer requests resubmission
    await loginAsOfficer(page);
    await page.click(`a[href="/officer/applications/${appId}"]`);
    await setApplicationStatus(page, "Under Review");
    await setApplicationStatus(page, "Pending Pre-Site Resubmission");

    // Operator edits and saves (but doesn't resubmit)
    await loginAsOperator(page);
    await page.click(`a[href="/operator/applications/${appId}"]`);

    await page.click('button:has-text("Edit")');
    await page.waitForTimeout(300);
    await page
      .locator('input[type="text"]')
      .first()
      .fill(`${businessName} - Draft Edit`);
    await page.click('button:has-text("Save Changes")');
    await page.waitForLoadState("networkidle");

    // Should still be Revision 1 (Save doesn't create revision)
    await expect(page.locator("p:has-text('Revision 1')")).toBeVisible();
    // Status should still be pending
    await expect(
      page.locator("text=Pending Pre-Site Resubmission").first()
    ).toBeVisible();

    // Now actually resubmit
    await page.click('button:has-text("Resubmit Application")');
    await page.waitForLoadState("networkidle");

    // NOW it should be Revision 2
    await expect(page.locator("p:has-text('Revision 2')")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Pre-Site Resubmitted").first()).toBeVisible();
  });

  test("operator can make multiple edits before resubmitting", async ({
    page,
  }) => {
    const businessName = `Multi Edit ${Date.now()}`;

    await loginAsOperator(page);
    const appId = await createApplication(page, businessName);

    // Officer requests resubmission
    await loginAsOfficer(page);
    await page.click(`a[href="/officer/applications/${appId}"]`);
    await setApplicationStatus(page, "Under Review");
    await setApplicationStatus(page, "Pending Pre-Site Resubmission");

    // Operator makes first edit
    await loginAsOperator(page);
    await page.click(`a[href="/operator/applications/${appId}"]`);

    await page.click('button:has-text("Edit")');
    await page.waitForTimeout(300);
    await page.locator('input[type="text"]').first().fill("First Edit");
    await page.click('button:has-text("Save Changes")');
    await page.waitForLoadState("networkidle");

    // Still revision 1
    await expect(page.locator("p:has-text('Revision 1')")).toBeVisible();

    // Operator makes second edit
    await page.click('button:has-text("Edit")');
    await page.waitForTimeout(300);
    await page.locator('input[type="text"]').first().fill("Second Edit");
    await page.click('button:has-text("Save Changes")');
    await page.waitForLoadState("networkidle");

    // Still revision 1
    await expect(page.locator("p:has-text('Revision 1')")).toBeVisible();

    // Now resubmit
    await page.click('button:has-text("Resubmit Application")');
    await page.waitForLoadState("networkidle");

    // Should be revision 2 with final edit
    await expect(page.locator("p:has-text('Revision 2')")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("h1")).toContainText("Second Edit");
  });
});

// Cleanup test files after all tests
test.afterAll(async () => {
  const testDir = path.join(__dirname, "test-files");
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});
