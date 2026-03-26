export function calculateGSTType(businessState: string, customerState: string): 'CGST_SGST' | 'IGST' {
  if (businessState.toLowerCase() === customerState.toLowerCase()) {
    return 'CGST_SGST';
  }
  return 'IGST';
}

export function calculateGST(subtotal: number, gstRate: number, gstType: 'CGST_SGST' | 'IGST') {
  const gstAmount = (subtotal * gstRate) / 100;
  if (gstType === 'CGST_SGST') {
    return {
      cgst: gstAmount / 2,
      sgst: gstAmount / 2,
      igst: 0,
      total: subtotal + gstAmount
    };
  } else {
    return {
      cgst: 0,
      sgst: 0,
      igst: gstAmount,
      total: subtotal + gstAmount
    };
  }
}

export const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry"
];
