/* js/tailwind-config.js
   Tailwind CDN 테마 설정
   ⚠️ css/variables.css 의 색상 값과 동일하게 유지해주세요.
*/

tailwind.config = {
    theme: {
        extend: {
            colors: {
                primary: '#10B981',
                secondary: '#B9C5CC',
                point1: '#FFFF00',
                point2: '#00A83E',
                bg: '#F8FAFC',
                border: '#E2E8F0',
                dark: '#111827'
            },
            fontFamily: {
                sans: ['Pretendard', 'sans-serif'],
            },
            boxShadow: {
                'soft': '0 4px 20px rgba(16, 185, 129, 0.08)',
            }
        }
    }
}
