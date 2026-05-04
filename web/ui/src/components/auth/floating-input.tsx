import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';

const INPUT_CLASS = `w-full rounded-2xl px-5 py-4
  text-white text-[17px] outline-none transition-all
  font-mono tracking-wider placeholder-transparent
  bg-black/80 border border-white/10
  backdrop-blur-3xl backdrop-saturate-[180%]
  shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]
  focus:border-white/25 focus:bg-black/100 peer`;

export function FloatingInput({ 
    label, 
    value, 
    onChange, 
    type = "text", 
    placeholder,
    autoComplete 
  }: { 
    label: string; 
    value: string; 
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    type?: string;
    placeholder?: string;
    autoComplete?: string;
  }) {
    const [isFocused, setIsFocused] = useState(false);
    // Определяем, должна ли метка "улететь" наверх
    const isFloating = isFocused || value.length > 0;
  
    return (
      <div className="relative group w-full">
        {/* Метка-заголовок */}
        <motion.label
          initial={false}
          animate={{
            // Базовое состояние: -50% (центрирование по вертикали) (считается от начального top-1/2)
            // top-1/2 = 50% от высоты контейнера, минус 50% от своей высоты = идеально центрировано
            // Активное состояние: улетает вверх на расстояние трех себя
            y: isFloating ? "-250%" : "-50%",
            x: isFloating ? "-10px" : "0%",
            scale: isFloating ? 0.85 : 1,
            opacity: isFloating ? 1 : 0.85,
            color: isFloating ? "rgba(255, 255, 255, 0.4)" : "rgba(255, 255, 255, 0.3)",
          }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="absolute top-1/2 left-5 pointer-events-none 
                     font-mono text-sm uppercase tracking-widest text-white 
                     origin-left z-10"
          >
          {label}
        </motion.label>
        
        {/* Плейсхолдер (появляется только при фокусе и пустом значении) */}
        <AnimatePresence>
          {isFocused && !value && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="absolute left-5 top-1/2 -translate-y-1/2 pointer-events-none font-mono text-[15px] text-zinc-600 z-10"
            >
              {placeholder}
            </motion.span>
          )}
        </AnimatePresence>
  
        {/* Инпут */}
        <input
          type={type}
          value={value}
          onChange={onChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          autoComplete={autoComplete}
          placeholder=""
          // Плейсхолдер показываем только при фокусе
          className={`${INPUT_CLASS}`}
        />
  
        {/* Декоративная линия фокуса */}
        <motion.div 
          className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent"
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: isFocused ? 1 : 0, opacity: isFocused ? 1 : 0 }}
          transition={{ duration: 0.6 }}
        />
      </div>
    );
  }