import { motion, MotionConfig, type HTMLMotionProps } from 'motion/react'
import type { PropsWithChildren } from 'react'

/** Raiz do app: respeita "Reduzir movimento" do sistema operacional em todas as animações da biblioteca. */
export function MotionRoot({ children }: PropsWithChildren) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}

/**
 * Card clicável de indicador: entra com leve subida (com atraso por posição),
 * sobe no hover e comprime no clique. Mantém as classes e o comportamento do botão original.
 */
export function MotionCardButton({ index = 0, className = '', children, ...props }: HTMLMotionProps<'button'> & { index?: number }) {
  return (
    <motion.button
      {...props}
      className={`${className} is-motion`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1], delay: Math.min(index, 5) * 0.03 }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
    >
      {children}
    </motion.button>
  )
}
