import React, { createContext, useContext, useState } from 'react';
import { PricingModal } from './PricingModal';

interface PricingContextType {
  openPricing: () => void;
}

const PricingContext = createContext<PricingContextType>({
  openPricing: () => {},
});

export const usePricing = () => useContext(PricingContext);

export const PricingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <PricingContext.Provider value={{ openPricing: () => setIsOpen(true) }}>
      {children}
      <PricingModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </PricingContext.Provider>
  );
};
