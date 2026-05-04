'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export const DigitBox = ({ value, index, isTyping }: { value: string, index: number, isTyping: boolean }) => {
  const [displayValue, setDisplayValue] = useState('0');

  useEffect(() => {
    // Если включен режим анимации (typing), запускаем перебор цифр
    if (isTyping && value !== '') {
      let iterations = 0;
      // Асинхронность: каждая следующая ячейка крутится чуть дольше
      const maxIterations = 6 + index * 3; 
      
      const interval = setInterval(() => {
        setDisplayValue(Math.floor(Math.random() * 10).toString());
        iterations++;
        
        if (iterations >= maxIterations) {
          setDisplayValue(value);
          clearInterval(interval);
        }
      }, 70);
      return () => clearInterval(interval);
    } else {
      setDisplayValue(value || '');
    }
  }, [value, isTyping, index]);

  return (
    <motion.div
      initial={{ y: 0 }}
      animate={isTyping ? { 
        y: [0, -12, 0], // Эффект прыжка домино
        transition: { delay: index * 0.1, duration: 0.4, ease: "easeOut" } 
      } : {}}
      className={`w-12 h-16 flex items-center justify-center rounded-xl border font-geist-mono text-2xl
        ${value 
          ? 'bg-white/10 border-white/30 text-white text-glow shadow-[0_0_15px_rgba(255,255,255,0.1)]' 
          : 'bg-white/2 border-white/10 text-white/50'
        } transition-all duration-300`}
    >
      {displayValue}
    </motion.div>
  );
};