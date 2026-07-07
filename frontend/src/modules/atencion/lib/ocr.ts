/**
 * On-device OCR + INE credential field parser.
 *
 * OCR is ASSIST ONLY: results prefill a form, are always editable, and must be
 * shown to the user marked "OCR — verifica". Never treat these fields as
 * authoritative — the human always confirms/corrects before submit.
 *
 * `tesseract.js` is lazy-imported so it never lands in the main bundle for
 * users who don't open the scan flow.
 */

export interface IneFields {
  nombre?: string;
  curp?: string;
  clave?: string;
  seccion?: string;
  domicilio?: string;
}

export interface IneScanResult {
  fields: IneFields;
  confidence: number; // fields found / 5, crude proxy — not a real OCR confidence score
}

const CURP_PATTERN = /[A-Z]{4}\d{6}[A-Z]{6}[A-Z0-9]{2}/;
const CLAVE_PATTERN = /[A-Z0-9]{18}/;
const CURP_LABEL_RE = new RegExp(`CURP\\s*[:\\-]?\\s*(${CURP_PATTERN.source})`);
const CLAVE_LABEL_RE = new RegExp(`CLAVE\\s*DE\\s*ELECTOR\\s*[:\\-]?\\s*(${CLAVE_PATTERN.source})`);
const SECCION_RE = /SECCI[A-ZÓO]*\s*[:\-]?\s*(\d{4})/;
const NOMBRE_RE = /NOMBRE\s*[:\-]?\s*([A-ZÑÁÉÍÓÚ][A-ZÑÁÉÍÓÚ .]{2,59})/;
const DOMICILIO_RE =
  /DOMICILIO\s*[:\-]?\s*([\s\S]{3,150}?)(?=\s*(?:CLAVE|CURP|SECCI|A[ÑN]O|FECHA|SEXO|$))/;

/**
 * Runs on-device OCR (Spanish) over an image blob and returns the raw
 * recognized text. Lazy-imports tesseract.js so it's only fetched when a
 * scan is actually attempted.
 */
export async function runOcr(blob: Blob): Promise<string> {
  const { default: Tesseract } = await import("tesseract.js");
  const { data } = await Tesseract.recognize(blob, "spa");
  return data.text;
}

/**
 * Pure regex parser: extracts INE credential fields from raw OCR text.
 * Defensive — any field not confidently found is simply omitted (undefined),
 * never guessed.
 */
export function parseIne(text: string): IneFields {
  const t = text.toUpperCase();
  const fields: IneFields = {};

  const curpLabelMatch = CURP_LABEL_RE.exec(t);
  const curpMatch = curpLabelMatch ?? new RegExp(CURP_PATTERN.source).exec(t);
  if (curpMatch) {
    fields.curp = curpLabelMatch ? curpLabelMatch[1] : curpMatch[0];
  }

  const claveLabelMatch = CLAVE_LABEL_RE.exec(t);
  if (claveLabelMatch) {
    fields.clave = claveLabelMatch[1];
  } else {
    // Fallback: any bare 18-char uppercase-alnum token that isn't the CURP.
    const generic = new RegExp(CLAVE_PATTERN.source, "g");
    let m: RegExpExecArray | null;
    while ((m = generic.exec(t))) {
      if (m[0] !== fields.curp) {
        fields.clave = m[0];
        break;
      }
    }
  }

  const seccionMatch = SECCION_RE.exec(t);
  if (seccionMatch) fields.seccion = seccionMatch[1];

  const nombreMatch = NOMBRE_RE.exec(t);
  if (nombreMatch) fields.nombre = nombreMatch[1].trim();

  const domicilioMatch = DOMICILIO_RE.exec(t);
  if (domicilioMatch) {
    fields.domicilio = domicilioMatch[1].replace(/\s*\n\s*/g, ", ").trim();
  }

  return fields;
}

/**
 * Convenience wrapper: OCR + parse + a crude confidence score
 * (fraction of the 5 expected fields that were found).
 */
export async function scanIne(blob: Blob): Promise<IneScanResult> {
  const text = await runOcr(blob);
  const fields = parseIne(text);
  const found = Object.values(fields).filter((v) => v !== undefined && v !== "").length;
  return { fields, confidence: found / 5 };
}
