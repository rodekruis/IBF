 WITH fsp_data AS (
  SELECT pra.id
  FROM "api-service".program_registration_attribute pra
  LEFT JOIN "api-service".program p ON p.id = pra."programId"
  LEFT JOIN "api-service".program_fsp_configuration f ON f."programId" = p.id
  WHERE pra."name" = 'whatsappPhoneNumber' AND f."fspName" = 'Intersolve-voucher-whatsapp'
)

UPDATE "api-service".intersolve_voucher iv
SET "whatsappPhoneNumber" = rd."value"
FROM "api-service".imagecode_export_vouchers iev
LEFT JOIN "api-service".registration r ON r.id = iev."registrationId"
LEFT JOIN "api-service".registration_attribute_data rd ON r.id = rd."registrationId", fsp_data fd
WHERE iv.id = iev."voucherId" AND rd."programRegistrationAttributeId" = fd.id;
