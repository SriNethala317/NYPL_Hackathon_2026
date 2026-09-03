-- ============================================================
-- Migration: widen source_type to cover every real document type
--
-- ocr_extractions.source_type and field_provenance.source_type were created
-- with only 4 of the app's 14 real document types (see
-- src/data/document-types.ts): DRIVERS_LICENSE, STATE_ID, W2, PASSPORT.
-- IDNYC in particular is a document type this app treats as central — the
-- constraint as written would reject the exact card most of the target
-- population would upload first.
--
-- Values are upper-snake-cased to match the existing convention in both
-- CHECK lists (DRIVERS_LICENSE, STATE_ID, ...), not the app's lower_snake
-- DocumentTypeId strings — the client is responsible for the mapping.
-- ============================================================

ALTER TABLE ocr_extractions DROP CONSTRAINT ocr_extractions_source_type_check;
ALTER TABLE ocr_extractions ADD CONSTRAINT ocr_extractions_source_type_check
    CHECK (source_type IN (
        'PASSPORT','STATE_ID','DRIVERS_LICENSE','IDNYC','PERMANENT_RESIDENT_CARD',
        'I20','W2','PAY_STUB','TAX_RETURN','BANK_STATEMENT','BENEFITS_LETTER',
        'LEASE','UTILITY_BILL','UNKNOWN'
    ));

ALTER TABLE field_provenance DROP CONSTRAINT field_provenance_source_type_check;
ALTER TABLE field_provenance ADD CONSTRAINT field_provenance_source_type_check
    CHECK (source_type IN (
        'USER','SYSTEM','ADMIN','APPLICATION',
        'PASSPORT','STATE_ID','DRIVERS_LICENSE','IDNYC','PERMANENT_RESIDENT_CARD',
        'I20','W2','PAY_STUB','TAX_RETURN','BANK_STATEMENT','BENEFITS_LETTER',
        'LEASE','UTILITY_BILL','UNKNOWN'
    ));
