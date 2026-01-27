import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check } from 'lucide-react';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  className?: string; // Applied to the trigger button
  placeholder?: string;
  ariaLabel?: string;
  icon?: React.ReactNode;
  width?: string;
  size?: 'sm' | 'md' | 'lg';
  containerClassName?: string;
}

export const Select: React.FC<SelectProps> = ({
  value,
  onChange,
  options,
  className = '',
  placeholder,
  ariaLabel,
  icon,
  width,
  size = 'md',
  containerClassName = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(opt => opt.value === value);

  // Default styles that might be overridden by className
  // Note: users of this component (like Onboarding) pass full tailwind classes.
  // We apply `className` to the button.

  return (
    <div
      className={`relative ${width || 'w-full'} ${containerClassName}`}
      ref={containerRef}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`${className} flex items-center justify-between text-left transition-colors cursor-pointer disabled:cursor-not-allowed`}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="flex items-center gap-2 truncate">
          {icon && <span className="flex-shrink-0">{icon}</span>}
          <span className={!selectedOption && placeholder ? "text-slate-400" : ""}>
            {selectedOption ? selectedOption.label : (placeholder || '선택해주세요')}
          </span>
        </span>
        {/* If the parent didn't provide its own chevron via absolute positioning (like in Onboarding mobile), we usually want one. 
            However, Onboarding mobile relies on absolute right-0 for the chevron. 
            The provided className in Onboarding has `appearance-none` (from native select habit) but for a button it doesn't matter much.
            But crucially, Onboarding.tsx puts its OWN chevron icon absolutely positioned OUTSIDE this component in the parent container?
            Let's check Onboarding usage.
            Mobile: <div className="relative"> <Select ... /> <span absolute...><ChevronDown/></span> </div>
            So the parent provides the icon. We don't need to force one here unless we want to standardise it. 
            But this component might be used elsewhere. 
            Given the passed className in Onboarding doesn't assume a flex layout with an icon, we should be careful.
            
            Actually, Onboarding PC passes: `className="... px-4 ... focus:ring-2 ..."`
            So it looks like a box.
            
            To avoid double icons (one from parent, one from here), let's check if the user wants us to rely on the parent's icon.
            The user said "dropdown part is completely default ui".
            So `Onboarding.tsx` has `<Select />` then `<div absolute><Chevron /></div>`.
            That Chevron is visual only.
            My `button` here handles the click.
            
            If I render a Chevron here, `Onboarding.tsx` will show TWO chevrons.
            I will render NO chevron by default if I can't detect it, OR I just leave it to the parent styling.
            Better yet, since I am rewriting `Select.tsx`, I should probably make it self-sufficient, but I can't easily change `Onboarding.tsx` to remove the external chevron in the same step easily without risking errors.
            So I will NOT render a chevron inside the button if the user strictly controls styling, 
            BUT for a "Premium UI", the dropdown LIST should be what matters.
         */}
      </button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute z-50 w-full mt-2 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden ring-1 ring-black/5"
            style={{
              minWidth: 'min(100%, 200px)', // Ensure it's not too tiny
              left: 0,
              right: 0
            }}
          >
            <div className="max-h-[240px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent p-1">
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-4 py-3 rounded-lg text-[15px] font-medium transition-colors flex items-center justify-between group ${value === option.value
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-700 hover:bg-slate-50'
                    }`}
                >
                  {option.label}
                  {value === option.value && (
                    <Check className="w-4 h-4 text-white" />
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
