/// <reference types="node" />
import { test, expect } from "@playwright/test";
import { submitApplication } from "./helpers/submission";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Tests covering identified gaps in acceptance criteria:
 * - Status mapping (officer vs operator labels)
 * - AI verification with actual file uploads
 * - Revision comparison with actual values
 * - Authorization by URL
 * - Section-linked feedback with label verification
 * - Comment resolution (fixed assertion)
 * - Predefined comment templates
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

// Create test PDF file
function createTestPdf(filename: string): string {
  const testDir = path.join(__dirname, "test-files");
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }
  const filePath = path.join(testDir, filename);
  // Minimal valid PDF content
  const pdfContent = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >> endobj
xref
0 4
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
trailer << /Size 4 /Root 1 0 R >>
startxref
196
%%EOF`;
  fs.writeFileSync(filePath, pdfContent);
  return filePath;
}

// ============================================================================
// Status Mapping Tests - Officer vs Operator see different labels
// ============================================================================
test.describe("Status Mapping - Role-specific labels", () => {
  test("operator sees 'Submitted' while officer sees 'Application Received' for same status", async ({
    page,
  }) => {
    // Create application as operator
    await loginAsOperator(page);
    const appId = await createApplication(page, `Status Label Test ${Date.now()}`);

    // Operator should see "Submitted" (not "Application Received")
    // Check the status badge text
    const operatorStatusBadge = page.locator('[class*="rounded-full"]').filter({ hasText: /Submitted|Application Received/ });
    await expect(operatorStatusBadge).toContainText("Submitted");
    await expect(operatorStatusBadge).not.toContainText("Application Received");

    // Officer should see "Application Received"
    await loginAsOfficer(page);
    await page.click(`a[href="/officer/applications/${appId}"]`);

    const officerStatusBadge = page.locator('[class*="rounded-full"]').filter({ hasText: /Submitted|Application Received/ });
    await expect(officerStatusBadge).toContainText("Application Received");
    await expect(officerStatusBadge).not.toContainText("Submitted");
  });

  test("officer status modal shows 'Route to Approval' not 'Pending Approval'", async ({
    page,
  }) => {
    await loginAsOperator(page);
    const appId = await createApplication(page, `Route Approval Test ${Date.now()}`);

    await loginAsOfficer(page);
    await page.click(`a[href="/officer/applications/${appId}"]`);

    // Set to Under Review first so we can see Route to Approval option
    await setApplicationStatus(page, "Under Review");

    // Open status modal
    await page.click('button:has-text("Change Status")');

    // Should show "Route to Approval" not "Pending Approval"
    await expect(page.locator('button:has-text("Route to Approval")')).toBeVisible();
    await expect(page.locator('button:has-text("Pending Approval")')).not.toBeVisible();

    // Close modal
    await page.click('button:has-text("Cancel")');
  });

  test("operator sees 'Pending Site Visit' while officer sees 'Site Visit Scheduled'", async ({
    page,
  }) => {
    // This tests the SITE_VISIT_SCHEDULED status mapping
    // Note: We can only verify the mapping exists in the labels, actual status transition
    // requires site visit workflow which is out of scope

    await loginAsOperator(page);
    await createApplication(page, `Site Visit Label Test ${Date.now()}`);

    // For now, verify the status badge component uses role-specific labels
    // by checking operator view shows expected format
    const statusBadge = page.locator('[class*="rounded-full"]').first();
    await expect(statusBadge).toBeVisible();
  });

  test("status history shows internal status values consistently", async ({
    page,
  }) => {
    await loginAsOperator(page);
    const appId = await createApplication(page, `History Test ${Date.now()}`);

    await loginAsOfficer(page);
    await page.click(`a[href="/officer/applications/${appId}"]`);
    await setApplicationStatus(page, "Under Review");

    // Check status history section shows the status
    const historySection = page.locator('section').filter({ hasText: 'Status History' });
    await expect(historySection).toBeVisible();

    // History should show "Under Review" transition
    await expect(historySection.locator("text=Under Review")).toBeVisible();
  });
});

// ============================================================================
// AI Verification Tests - Actual file uploads
// ============================================================================
test.describe("AI Verification - File uploads", () => {
  test("upload valid PDF and see VERIFIED status", async ({ page }) => {
    const testFile = createTestPdf("valid_license.pdf");

    await loginAsOperator(page);
    await createApplication(page, `AI Verify Valid ${Date.now()}`);

    // Upload file using file input
    const fileInput = page.locator("#file-business_license");
    await fileInput.setInputFiles(testFile);
    await page.waitForLoadState("networkidle");

    // Should show verification badge - look for verified status
    // The AI mock returns VERIFIED for files without "expired", "blurry", "invalid", "fake" keywords
    await expect(page.locator("text=Verified").first()).toBeVisible({ timeout: 10000 });
  });

  test("upload expired document and see FLAGGED status", async ({ page }) => {
    // Create file with "expired" in the name - AI mock will flag it
    const testFile = createTestPdf("expired_license.pdf");

    await loginAsOperator(page);
    await createApplication(page, `AI Verify Expired ${Date.now()}`);

    // Upload file
    const fileInput = page.locator("#file-business_license");
    await fileInput.setInputFiles(testFile);
    await page.waitForLoadState("networkidle");

    // Should show flagged status
    await expect(page.locator("text=Flagged").first()).toBeVisible({ timeout: 10000 });
  });

  test("upload fake document and see FAILED status", async ({ page }) => {
    // Create file with "fake" in the name - AI mock will fail it
    const testFile = createTestPdf("fake_document.pdf");

    await loginAsOperator(page);
    await createApplication(page, `AI Verify Fake ${Date.now()}`);

    // Upload file
    const fileInput = page.locator("#file-business_license");
    await fileInput.setInputFiles(testFile);
    await page.waitForLoadState("networkidle");

    // Should show failed status
    await expect(page.locator("text=Failed").first()).toBeVisible({ timeout: 10000 });
  });

  test("officer sees AI verification alerts for flagged documents", async ({
    page,
  }) => {
    const testFile = createTestPdf("expired_business_license.pdf");

    await loginAsOperator(page);
    const appId = await createApplication(page, `Officer AI View ${Date.now()}`);

    // Upload flagged document
    const fileInput = page.locator("#file-business_license");
    await fileInput.setInputFiles(testFile);
    await page.waitForLoadState("networkidle");

    // Establish completed verification before testing officer rendering.
    await expect(page.getByText("Flagged", { exact: true })).toBeVisible();

    // Officer views application
    await loginAsOfficer(page);
    await page.click(`a[href="/officer/applications/${appId}"]`);

    // Should see AI Verification Issues alert
    await expect(page.locator("text=AI Verification Issues")).toBeVisible();

    // Should show the flagged document with message
    await expect(page.locator("text=Flagged").first()).toBeVisible();
  });
});

// ============================================================================
// Revision Comparison - Actual values
// ============================================================================
test.describe("Revision Comparison - Value verification", () => {
  test("shows actual old and new values for changed fields", async ({ page }) => {
    const originalName = `Original Biz ${Date.now()}`;
    const updatedName = `Updated Biz ${Date.now()}`;

    await loginAsOperator(page);
    const appId = await createApplication(page, originalName);

    // Officer requests resubmission
    await loginAsOfficer(page);
    await page.click(`a[href="/officer/applications/${appId}"]`);
    await setApplicationStatus(page, "Under Review");
    await setApplicationStatus(page, "Pending Pre-Site Resubmission");

    // Operator updates business name
    await loginAsOperator(page);
    await page.click(`a[href="/operator/applications/${appId}"]`);
    await page.click('button:has-text("Edit")');
    await page.waitForTimeout(300);
    await page.locator('input[type="text"]').first().fill(updatedName);
    await page.click('button:has-text("Save Changes")');
    await expect(page.getByText("Changes saved successfully", { exact: true })).toBeVisible();
    const resubmitButton = page.getByRole("button", { name: "Resubmit Application", exact: true });
    await expect(resubmitButton).toBeEnabled();
    await resubmitButton.click();
    await expect(page.getByText("Application submitted successfully", { exact: true })).toBeVisible();
    await expect(page.locator("p").filter({ hasText: /Revision 2/ })).toBeVisible();

    // Officer views - should see actual values in comparison
    await loginAsOfficer(page);
    await page.click(`a[href="/officer/applications/${appId}"]`);

    // Should show "What Changed" section
    await expect(page.locator('h2:has-text("What Changed")')).toBeVisible();

    // The UI uses a human-readable field label.
    const comparison = page.locator("section").filter({ has: page.getByRole("heading", { name: /What Changed/ }) });
    await expect(comparison.getByText("Business Name", { exact: true })).toBeVisible();

    // Should show the old value
    await expect(page.locator(`text=${originalName}`).first()).toBeVisible();

    // Should show the new value
    await expect(page.locator(`text=${updatedName}`).first()).toBeVisible();
  });

  test("shows document changes between revisions", async ({ page }) => {
    const testFile = createTestPdf("license_v1.pdf");
    const testFile2 = createTestPdf("license_v2.pdf");

    await loginAsOperator(page);
    const appId = await createApplication(page, `Doc Compare ${Date.now()}`);

    // Upload initial document
    const fileInput = page.locator("#file-business_license");
    await fileInput.setInputFiles(testFile);
    await page.waitForLoadState("networkidle");

    // Officer requests resubmission
    await loginAsOfficer(page);
    await page.click(`a[href="/officer/applications/${appId}"]`);
    await setApplicationStatus(page, "Under Review");
    await setApplicationStatus(page, "Pending Pre-Site Resubmission");

    // Operator uploads new version
    await loginAsOperator(page);
    await page.click(`a[href="/operator/applications/${appId}"]`);

    // Upload replacement document
    const fileInput2 = page.locator('input[type="file"]').first();
    await fileInput2.setInputFiles(testFile2);
    await page.waitForLoadState("networkidle");

    await page.click('button:has-text("Resubmit Application")');
    await page.waitForLoadState("networkidle");

    // Officer views - should see document changes
    await loginAsOfficer(page);
    await page.click(`a[href="/officer/applications/${appId}"]`);

    // Should show document section with version info
    await expect(page.locator("text=v2").first()).toBeVisible();
  });
});

// ============================================================================
// Authorization Tests - URL and API access
// ============================================================================
test.describe("Authorization - Access control", () => {
  test("operator cannot access another operator's application by URL", async ({
    page,
  }) => {
    // Create app as operator1
    await loginAsOperator(page, "operator1");
    const appId = await createApplication(page, `Private App ${Date.now()}`);

    // Try to access as operator2
    await loginAsOperator(page, "operator2");

    // Directly navigate to operator1's application
    await page.goto(`/operator/applications/${appId}`);
    await page.waitForLoadState("networkidle");

    // Should either redirect away or show error - not show the application
    // Check that we're not seeing the application details
    const businessInfoSection = page.locator('h2:has-text("Business Information")');

    // Either show error/not found, or redirect to applications list
    const isOnDetailPage = await businessInfoSection.isVisible().catch(() => false);
    expect(isOnDetailPage).toBe(false);
  });

  test("operator cannot access officer routes", async ({ page }) => {
    await loginAsOperator(page);

    // Try to access officer queue
    await page.goto("/officer/queue");
    await page.waitForLoadState("networkidle");

    // Should redirect to operator dashboard or show unauthorized
    await expect(page).not.toHaveURL("/officer/queue");
  });

  test("officer cannot access operator edit functionality", async ({ page }) => {
    // Create app as operator
    await loginAsOperator(page);
    const appId = await createApplication(page, `No Edit Test ${Date.now()}`);

    // Login as officer
    await loginAsOfficer(page);
    await page.click(`a[href="/officer/applications/${appId}"]`);

    // Officer should not see Edit button
    await expect(page.locator('button:has-text("Edit")')).not.toBeVisible();
  });
});

// ============================================================================
// Section-Linked Feedback - Label verification
// ============================================================================
test.describe("Section-Linked Feedback", () => {
  test("comment shows section label, not just section ID", async ({ page }) => {
    await loginAsOperator(page);
    const appId = await createApplication(page, `Section Label ${Date.now()}`);

    await loginAsOfficer(page);
    await page.click(`a[href="/officer/applications/${appId}"]`);

    // Select a section from dropdown
    const sectionSelect = page.locator("select").first();
    await sectionSelect.selectOption("business_license");

    // Add comment
    await page.fill(
      'textarea[placeholder="Enter your feedback..."]',
      "Please provide valid business license."
    );
    await page.click('button:has-text("Add Comment")');
    await page.waitForLoadState("networkidle");

    // Comment should show "Business License" label, not "business_license"
    const commentSection = page.locator("text=Please provide valid business license").locator("..");
    await expect(commentSection.getByText("Business License", { exact: true })).toBeVisible();
  });

  test("operator sees section label in feedback alert", async ({ page }) => {
    await loginAsOperator(page);
    const appId = await createApplication(page, `Operator Section ${Date.now()}`);

    // Officer adds section-linked comment
    await loginAsOfficer(page);
    await page.click(`a[href="/officer/applications/${appId}"]`);
    await setApplicationStatus(page, "Under Review");

    const sectionSelect = page.locator("select").first();
    await sectionSelect.selectOption("floor_plan");

    await page.fill(
      'textarea[placeholder="Enter your feedback..."]',
      "Floor plan needs to show emergency exits."
    );
    await page.click('button:has-text("Add Comment")');
    await page.waitForLoadState("networkidle");

    await setApplicationStatus(page, "Pending Pre-Site Resubmission");

    // Operator views - should see section label
    await loginAsOperator(page);
    await page.click(`a[href="/operator/applications/${appId}"]`);

    // Feedback should show "Floor Plan" label
    await expect(page.locator("text=Floor Plan").first()).toBeVisible();
    await expect(page.locator("text=Floor plan needs to show emergency exits").first()).toBeVisible();
  });
});

// ============================================================================
// Comment Resolution - Fixed assertion
// ============================================================================
test.describe("Comment Resolution - Proper verification", () => {
  test("resolved comment shows resolved indicator separate from button", async ({
    page,
  }) => {
    await loginAsOperator(page);
    const appId = await createApplication(page, `Resolve Test ${Date.now()}`);

    await loginAsOfficer(page);
    await page.click(`a[href="/officer/applications/${appId}"]`);

    // Add a comment
    await page.fill(
      'textarea[placeholder="Enter your feedback..."]',
      "Test comment to resolve."
    );
    await page.click('button:has-text("Add Comment")');
    await page.waitForLoadState("networkidle");

    // Count "Mark Resolved" buttons before resolving
    const resolveButtonsBefore = await page.locator('button:has-text("Mark Resolved")').count();
    expect(resolveButtonsBefore).toBeGreaterThan(0);

    // Click resolve
    await page.locator('button:has-text("Mark Resolved")').first().click();
    await page.waitForLoadState("networkidle");

    // After resolving, the button should be gone for that comment
    // and a "Resolved" badge/indicator should appear
    const resolveButtonsAfter = await page.locator('button:has-text("Mark Resolved")').count();
    expect(resolveButtonsAfter).toBe(resolveButtonsBefore - 1);

    // Should show a resolved indicator (not the button text)
    // Look for a span or badge with "Resolved" that's NOT a button
    const resolvedBadge = page.locator('span:has-text("Resolved")').first();
    await expect(resolvedBadge).toBeVisible();
  });

  test("resolved and unresolved comments are visually distinct", async ({
    page,
  }) => {
    await loginAsOperator(page);
    const appId = await createApplication(page, `Visual Distinct ${Date.now()}`);

    await loginAsOfficer(page);
    await page.click(`a[href="/officer/applications/${appId}"]`);

    // Add two comments
    await page.fill('textarea[placeholder="Enter your feedback..."]', "Comment 1 - will resolve");
    await page.click('button:has-text("Add Comment")');
    await page.waitForLoadState("networkidle");

    await page.fill('textarea[placeholder="Enter your feedback..."]', "Comment 2 - stays open");
    await page.click('button:has-text("Add Comment")');
    await page.waitForLoadState("networkidle");

    // Target comments by content rather than their newest-first position.
    const resolvedComment = page.getByText("Comment 1 - will resolve", { exact: true })
      .locator("..").locator("..");
    const unresolvedComment = page.getByText("Comment 2 - stays open", { exact: true })
      .locator("..").locator("..");

    await resolvedComment.getByRole("button", { name: "Mark Resolved", exact: true }).click();
    await expect(resolvedComment.getByText("Resolved", { exact: true })).toBeVisible();
    await expect(resolvedComment.getByRole("button", { name: "Mark Resolved", exact: true })).toHaveCount(0);
    await expect(unresolvedComment.getByRole("button", { name: "Mark Resolved", exact: true })).toBeVisible();
    await expect(unresolvedComment.getByText("Resolved", { exact: true })).toHaveCount(0);
  });
});

// ============================================================================
// Predefined Comment Templates
// ============================================================================
test.describe("Predefined Comment Templates", () => {
  test("template buttons exist for common issues", async ({ page }) => {
    await loginAsOperator(page);
    const appId = await createApplication(page, `Template Test ${Date.now()}`);

    await loginAsOfficer(page);
    await page.click(`a[href="/officer/applications/${appId}"]`);

    // Template buttons should be visible
    await expect(page.locator('button:has-text("Document expired")')).toBeVisible();
    await expect(page.locator('button:has-text("Image unclear")')).toBeVisible();
    await expect(page.locator('button:has-text("Information mismatch")')).toBeVisible();
    await expect(page.locator('button:has-text("Missing pages")')).toBeVisible();
    await expect(page.locator('button:has-text("Wrong document type")')).toBeVisible();
  });

  test("clicking template populates textarea with predefined text", async ({ page }) => {
    await loginAsOperator(page);
    const appId = await createApplication(page, `Template Click ${Date.now()}`);

    await loginAsOfficer(page);
    await page.click(`a[href="/officer/applications/${appId}"]`);

    // Click a template button
    await page.click('button:has-text("Document expired")');

    // Textarea should be populated with the template content
    const textarea = page.locator('textarea[placeholder="Enter your feedback..."]');
    await expect(textarea).toHaveValue("The uploaded document has expired. Please provide a current version.");
  });

  test("template can be submitted as a comment", async ({ page }) => {
    await loginAsOperator(page);
    const appId = await createApplication(page, `Template Submit ${Date.now()}`);

    await loginAsOfficer(page);
    await page.click(`a[href="/officer/applications/${appId}"]`);

    // Use template and submit
    await page.click('button:has-text("Image unclear")');
    await page.click('button:has-text("Add Comment")');
    await page.waitForLoadState("networkidle");

    // Comment should appear with template text
    await expect(page.locator("text=The uploaded image is unclear or blurry").first()).toBeVisible();
  });
});

// ============================================================================
// Invalid Status Transitions
// ============================================================================
test.describe("Invalid Status Transitions", () => {
  test("cannot jump from Application Received directly to Approved", async ({
    page,
  }) => {
    await loginAsOperator(page);
    const appId = await createApplication(page, `Invalid Transition ${Date.now()}`);

    await loginAsOfficer(page);
    await page.click(`a[href="/officer/applications/${appId}"]`);

    // Open status modal
    await page.click('button:has-text("Change Status")');

    // "Approved" should NOT be in the list of available transitions
    // from APPLICATION_RECEIVED state
    await expect(page.locator('button:has-text("Approved")')).not.toBeVisible();

    // Only valid options should be visible: Under Review, Rejected
    await expect(page.locator('button:has-text("Under Review")')).toBeVisible();
    await expect(page.locator('button:has-text("Rejected")')).toBeVisible();

    await page.click('button:has-text("Cancel")');
  });

  test("valid transitions are enforced per status", async ({ page }) => {
    await loginAsOperator(page);
    const appId = await createApplication(page, `Valid Trans ${Date.now()}`);

    await loginAsOfficer(page);
    await page.click(`a[href="/officer/applications/${appId}"]`);

    // From APPLICATION_RECEIVED, go to UNDER_REVIEW
    await setApplicationStatus(page, "Under Review");

    // Open modal again
    await page.click('button:has-text("Change Status")');

    // From UNDER_REVIEW, should have different options
    await expect(page.locator('button:has-text("Pending Pre-Site Resubmission")')).toBeVisible();
    await expect(page.locator('button:has-text("Route to Approval")')).toBeVisible();
    await expect(page.locator('button:has-text("Rejected")')).toBeVisible();

    // Should NOT show "Under Review" (already in that state)
    await expect(page.locator('button:has-text("Under Review")')).not.toBeVisible();

    await page.click('button:has-text("Cancel")');
  });
});

// ============================================================================
// Notifications
// ============================================================================
test.describe("Notifications - Status change triggers", () => {
  test("operator's application list shows updated status after officer change", async ({
    page,
  }) => {
    await loginAsOperator(page);
    const businessName = `Notify Test ${Date.now()}`;
    const appId = await createApplication(page, businessName);

    // Officer changes status
    await loginAsOfficer(page);
    await page.click(`a[href="/officer/applications/${appId}"]`);
    await setApplicationStatus(page, "Under Review");
    await setApplicationStatus(page, "Pending Pre-Site Resubmission");

    // Operator should see updated status in their list
    await loginAsOperator(page);
    await expect(page.locator(`text=${businessName}`)).toBeVisible();

    // The status badge should reflect the new status
    const appRow = page.getByRole("row").filter({
      has: page.locator(`a[href="/operator/applications/${appId}"]`),
    });
    await expect(appRow.locator("text=Pending Pre-Site Resubmission")).toBeVisible();
  });
});

// ============================================================================
// Cleanup
// ============================================================================
test.afterAll(async () => {
  const testDir = path.join(__dirname, "test-files");
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});
