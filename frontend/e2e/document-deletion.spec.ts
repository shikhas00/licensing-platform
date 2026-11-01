import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { submitApplication } from "./helpers/submission";

const operator = { "X-User-ID": "deletion-operator", "X-User-Role": "operator" };
const officer = { "X-User-ID": "deletion-officer", "X-User-Role": "officer" };

async function login(page: Page, role: "operator" | "officer") {
  await page.goto("/login");
  await page.locator("#userId").fill(`deletion-${role}`);
  await page.getByRole("button", { name: role === "officer" ? /^Officer/ : /^Operator/ }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(role === "operator" ? "/operator/applications" : "/officer/queue");
}

async function create(page: Page) {
  await login(page, "operator");
  await page.getByRole("navigation").getByRole("link", { name: "New Application", exact: true }).click();
  await page.locator("#business_name").fill(`Deletion regression ${Date.now()}`);
  const created = page.waitForResponse(r => r.request().method() === "POST" && /\/api\/applications\/$/.test(new URL(r.url()).pathname));
  await page.getByRole("button", { name: "Create Application", exact: true }).click();
  const response = await created;
  expect(response.status()).toBe(201);
  const application = await response.json();
  await expect(page).toHaveURL(`/operator/applications/${application.id}`);
  return { id: application.id as number, api: response.url().replace(/\/$/, "") + `/${application.id}` };
}

async function createUnsubmitted(page: Page, request: APIRequestContext) {
  // The UI now submits automatically; use the create-only API to exercise a draft.
  const submitted = await create(page);
  const response = await request.post(submitted.api.replace(/\/\d+$/, "/"), {
    headers: operator,
    data: { business_name: `Unsubmitted regression ${Date.now()}` },
  });
  expect(response.status()).toBe(201);
  const { id } = await response.json();
  const api = submitted.api.replace(/\/\d+$/, `/${id}`);
  await page.goto(`/operator/applications/${id}`);
  return { id, api };
}

async function upload(request: APIRequestContext, api: string, name: string, supersedes?: number) {
  const response = await request.post(`${api}/documents/`, {
    headers: operator,
    multipart: {
      section: "business_license",
      ...(supersedes === undefined ? {} : { supersedes_id: String(supersedes) }),
      file: { name, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF") },
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  return response.json();
}

async function requestChanges(request: APIRequestContext, api: string) {
  for (const status of ["Under Review", "Pending Pre-Site Resubmission"]) {
    const response = await request.patch(`${api}/status`, { headers: officer, data: { status } });
    expect(response.ok(), await response.text()).toBeTruthy();
  }
}

test("unsubmitted applications are hidden from officers until initial submission", async ({ page, request }) => {
  const { id, api } = await createUnsubmitted(page, request);
  expect((await request.get(api, { headers: officer })).status()).toBe(404);
  await login(page, "officer");
  await expect(page.locator(`a[href="/officer/applications/${id}"]`)).toHaveCount(0);
  await login(page, "operator");
  await page.goto(`/operator/applications/${id}`);
  await submitApplication(page);
  await login(page, "officer");
  await expect(page.locator(`a[href="/officer/applications/${id}"]`)).toBeVisible();
});

test("submitted document remains visible to officer until pending deletion is resubmitted", async ({ page, request }) => {
  const { id, api } = await create(page);
  const doc = await upload(request, api, "submitted_license.pdf");
  await submitApplication(page);
  await requestChanges(request, api);
  expect((await request.delete(`${api}/documents/${doc.id}`, { headers: operator })).status()).toBe(204);
  await page.reload();
  await expect(page.getByText("Pending deletion", { exact: true })).toBeVisible();
  await login(page, "officer");
  await page.goto(`/officer/applications/${id}`);
  const download = page.getByRole("button", { name: doc.filename, exact: true });
  await expect(download).toBeVisible();
  const downloaded = page.waitForEvent("download");
  await download.click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe(doc.filename);
  expect(await file.failure()).toBeNull();
  await login(page, "operator");
  await page.goto(`/operator/applications/${id}`);
  await submitApplication(page, true);
  await expect(page.getByText("Pending deletion", { exact: true })).toHaveCount(0);
  await login(page, "officer");
  await page.goto(`/officer/applications/${id}`);
  await expect(page.getByRole("heading", { name: "Documents", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: doc.filename, exact: true })).toHaveCount(0);
  expect((await request.get(`${api}/documents/${doc.id}/download`, { headers: officer })).status()).toBe(404);
});

test("deleting before initial submission removes the document immediately", async ({ page, request }) => {
  const { api } = await createUnsubmitted(page, request);
  const doc = await upload(request, api, "unsubmitted_license.pdf");
  expect((await request.delete(`${api}/documents/${doc.id}`, { headers: operator })).status()).toBe(204);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Documents", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: doc.filename, exact: true })).toHaveCount(0);
  await submitApplication(page);
  const detail = await request.get(api, { headers: officer });
  expect(detail.ok()).toBeTruthy();
  expect((await detail.json()).documents).toEqual([]);
});

test("deleting a draft replacement preserves the original submitted document", async ({ page, request }) => {
  const { api } = await create(page);
  const original = await upload(request, api, "original_license.pdf");
  await submitApplication(page);
  await requestChanges(request, api);
  const replacement = await upload(request, api, "draft_license.pdf", original.id);
  expect((await request.delete(`${api}/documents/${replacement.id}`, { headers: operator })).status()).toBe(204);
  await page.reload();
  await submitApplication(page, true);
  const detail = await request.get(api, { headers: officer });
  expect((await detail.json()).documents.map((d: { id: number }) => d.id)).toEqual([original.id]);
});
