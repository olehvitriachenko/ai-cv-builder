import { ApiError, apiFetchBlob } from "@/shared/api/fetcher";
import type { PdfResponse } from "@/lib/cv/download-flow";

/** The latest saved draft of an owned CV as a PDF. The server decides the file name. */
export async function fetchCvPdf(cvId: string): Promise<PdfResponse> {
  const response = await apiFetchBlob(`/cvs/${encodeURIComponent(cvId)}/pdf`, "application/pdf");
  // A 200 that is not a PDF (for example a proxy error page) must not be saved as a PDF.
  if (response.blob.type !== "application/pdf") {
    throw new ApiError(200, "INVALID_RESPONSE", "Unexpected response from the server");
  }
  return response;
}
