import { motion } from 'framer-motion'

const timeline = [
  {
    year: '2022',
    content: 'Joined the Software and Knowledge Engineering program (SKE22) at Kasetsart University.'
  },
  {
    year: '2023',
    content: 'Explored web development and created personal projects.'
  },
  {
    year: '2024',
    content: 'Building a portfolio with Next.js and Framer Motion.'
  }
]

export default function Page() {
  return (
    <main className="p-8">
      <section className="text-center mb-12">
        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-4xl font-bold"
        >
          Phurinat Khrueatan
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-lg mt-4"
        >
          SKE22 at Kasetsart University
        </motion.p>
      </section>
      <section className="max-w-2xl mx-auto">
        {timeline.map((item, idx) => (
          <motion.div
            key={item.year}
            className="mb-8"
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.8 }}
            transition={{ duration: 0.5, delay: idx * 0.1 }}
          >
            <div className="font-semibold">{item.year}</div>
            <div>{item.content}</div>
          </motion.div>
        ))}
      </section>
    </main>
  )
}
