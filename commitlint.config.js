export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "subject-case": [0], // 한글 허용
    "header-max-length": [2, "always", 50], // 50자 제한
  },
};
