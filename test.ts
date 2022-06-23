import { Tcc } from "./main.ts";

const tcc = new Tcc();

tcc.setErrorFunc((msg) => {
  console.log(msg);
});

tcc.addLibraryPath("H:\\Projects\\denocc\\tcc\\lib");
tcc.setOutputType("MEMORY");

tcc.addSymbol(
  "get_num",
  {
    parameters: [],
    result: "i32",
  } as const,
  () => {
    return 10;
  },
);

tcc.compileString(`
  extern int get_num();

  int add(int a, int b) {
    return get_num() + a + b;
  }
`);

tcc.relocate("auto");

console.log(tcc.getSymbol(
  "add",
  {
    parameters: ["i32", "i32"],
    result: "i32",
  } as const,
)!(1, 2));

tcc.delete();
