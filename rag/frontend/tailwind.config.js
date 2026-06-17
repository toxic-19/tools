/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'var(--primary)',
          hover: 'var(--primary-hover)',
          bg: 'var(--primary-bg)',
          border: 'var(--primary-border)',
          text: 'var(--primary-text)',
        },
        sem: {
          embed: 'var(--sem-embed)',
          'embed-bg': 'var(--sem-embed-bg)',
          retrieval: 'var(--sem-retrieval)',
          'retrieval-bg': 'var(--sem-retrieval-bg)',
          rerank: 'var(--sem-rerank)',
          'rerank-bg': 'var(--sem-rerank-bg)',
          llm: 'var(--sem-llm)',
          'llm-bg': 'var(--sem-llm-bg)',
        },
      },
    },
  },
  plugins: [],
}
