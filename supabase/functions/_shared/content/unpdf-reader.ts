import { getDocumentProxy } from 'unpdf';
import { PdfOpenError, type PdfDocument, type PdfReader } from './pdf.ts';

type TextItem = { str?: string; hasEOL?: boolean };

/** PdfReader on unpdf (pdf.js for serverless runtimes); see the Phase 4 spike in ADR-0001. */
export const unpdfReader: PdfReader = {
  async open(bytes: Uint8Array): Promise<PdfDocument> {
    let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
    try {
      // pdf.js may detach the buffer it is given, so it gets a copy.
      pdf = await getDocumentProxy(new Uint8Array(bytes));
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      if (name === 'PasswordException')
        throw new PdfOpenError('pdf_encrypted', 'password required');
      throw new PdfOpenError('pdf_corrupt', name || 'unreadable PDF');
    }
    return {
      numPages: pdf.numPages,
      async pageText(pageNumber: number) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        page.cleanup();
        return (content.items as TextItem[])
          .map((item) => `${item.str ?? ''}${item.hasEOL ? '\n' : ''}`)
          .join('');
      },
    };
  },
};
