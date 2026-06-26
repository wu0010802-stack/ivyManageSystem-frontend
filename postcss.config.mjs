import postcssGlobalData from '@csstools/postcss-global-data'
import postcssCustomMedia from 'postcss-custom-media'

export default {
  plugins: [
    // 把 breakpoints.media.css 的 @custom-media 定義注入每個 CSS 編譯單元，
    // 否則各 SFC <style scoped> 獨立編譯時看不到定義。
    postcssGlobalData({ files: ['src/assets/breakpoints.media.css'] }),
    // 將 @media (--to-sm) 解析回 @media (max-width: 767.98px)。
    postcssCustomMedia(),
  ],
}
