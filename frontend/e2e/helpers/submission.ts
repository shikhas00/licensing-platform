import { expect, type Page } from "@playwright/test";

/** Wait for the submission and the refreshed detail view before changing roles. */
export async function submitApplication(page: Page, resubmit = false) {
  const button = page.getByRole("button", {
    name: resubmit ? "Resubmit Application" : "Submit Application",
    exact: true,
  });
  await expect(button).toBeEnabled();
  const responsePromise = page.waitForResponse((response) =>
    response.request().method() === "POST" &&
    /\/api\/applications\/\d+\/submit$/.test(new URL(response.url()).pathname)
  );
  await button.click();
  const response = await responsePromise;
  expect(response.ok(), await response.text()).toBeTruthy();
  await expect(page.getByText("Application submitted successfully", { exact: true })).toBeVisible();
}
