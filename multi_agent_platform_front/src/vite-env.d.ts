/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_URL: string;
    // 필요에 따라 추가 환경 변수 타입을 정의
  }
  
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }