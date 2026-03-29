/**
 * Returns the current local date in YYYY-MM-DD format.
 */
export const getLocalDateString = (date: Date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Calculates a due date based on payment terms from a given start date.
 */
export const calculateDueDate = (startDate: Date, terms: string): string => {
  const date = new Date(startDate);
  if (terms === '7 days') date.setDate(date.getDate() + 7);
  else if (terms === '15 days') date.setDate(date.getDate() + 15);
  else if (terms === '30 days') date.setDate(date.getDate() + 30);
  return getLocalDateString(date);
};
