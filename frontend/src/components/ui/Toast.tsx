import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { Toast } from '../../hooks/useToast';

interface ToastContainerProps {
  toasts: Toast[];
  onClose: (id: string) => void;
  isDarkMode?: boolean;
}

export function ToastContainer({ toasts, onClose, isDarkMode = false }: ToastContainerProps) {
  const getToastIcon = (type: Toast['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'info':
        return <Info className="w-5 h-5 text-blue-500" />;
      default:
        return <Info className="w-5 h-5 text-blue-500" />;
    }
  };

  const getToastStyles = (type: Toast['type']) => {
    const baseStyles = isDarkMode
      ? 'bg-zinc-800 border-zinc-700 text-slate-100'
      : 'bg-white border-zinc-200 text-slate-800';

    switch (type) {
      case 'success':
        return `${baseStyles} ${isDarkMode ? 'border-green-500/30' : 'border-green-200'}`;
      case 'error':
        return `${baseStyles} ${isDarkMode ? 'border-red-500/30' : 'border-red-200'}`;
      case 'warning':
        return `${baseStyles} ${isDarkMode ? 'border-yellow-500/30' : 'border-yellow-200'}`;
      case 'info':
        return `${baseStyles} ${isDarkMode ? 'border-blue-500/30' : 'border-blue-200'}`;
      default:
        return baseStyles;
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-md w-full pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={`rounded-lg border shadow-lg p-4 pointer-events-auto ${getToastStyles(toast.type)}`}
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                {getToastIcon(toast.type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{toast.message}</p>
              </div>
              <button
                onClick={() => onClose(toast.id)}
                className={`flex-shrink-0 p-1 rounded-md transition-colors ${
                  isDarkMode
                    ? 'hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200'
                    : 'hover:bg-zinc-100 text-zinc-500 hover:text-zinc-700'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
