const lib = Deno.dlopen(
  "./tcc/libtcc.dll",
  {
    tcc_new: {
      parameters: [],
      result: "pointer",
    },

    tcc_delete: {
      parameters: ["pointer"],
      result: "void",
    },

    tcc_set_lib_path: {
      parameters: ["pointer", "pointer"],
      result: "void",
    },

    tcc_set_error_func: {
      parameters: ["pointer", "pointer", "function"],
      result: "void",
    },

    tcc_set_options: {
      parameters: ["pointer", "pointer"],
      result: "void",
    },

    tcc_add_include_path: {
      parameters: ["pointer", "pointer"],
      result: "i32",
    },

    tcc_add_sysinclude_path: {
      parameters: ["pointer", "pointer"],
      result: "i32",
    },

    tcc_define_symbol: {
      parameters: ["pointer", "pointer", "pointer"],
      result: "void",
    },

    tcc_undefine_symbol: {
      parameters: ["pointer", "pointer"],
      result: "void",
    },

    tcc_add_file: {
      parameters: ["pointer", "pointer"],
      result: "i32",
    },

    tcc_compile_string: {
      parameters: ["pointer", "pointer"],
      result: "i32",
    },

    tcc_set_output_type: {
      parameters: ["pointer", "i32"],
      result: "i32",
    },

    tcc_add_library_path: {
      parameters: ["pointer", "pointer"],
      result: "i32",
    },

    tcc_add_library: {
      parameters: ["pointer", "pointer"],
      result: "i32",
    },

    tcc_add_symbol: {
      parameters: ["pointer", "pointer", "function"],
      result: "i32",
    },

    tcc_output_file: {
      parameters: ["pointer", "pointer"],
      result: "i32",
    },

    tcc_run: {
      parameters: ["pointer", "i32", "pointer"],
      result: "i32",
    },

    tcc_relocate: {
      parameters: ["pointer", "pointer"],
      result: "i32",
    },

    tcc_get_symbol: {
      parameters: ["pointer", "pointer"],
      result: "pointer",
    },
  } as const,
).symbols;

function cstr(str: string) {
  const buf = new Uint8Array(str.length + 1);
  new TextEncoder().encodeInto(str, buf);
  return buf;
}

export const OUTPUT_TYPE = {
  MEMORY: 1,
  EXE: 2,
  DLL: 3,
  OBJ: 4,
  PREPROCESS: 5,
} as const;

export class Tcc {
  handle: bigint;
  cleanups = new Set<CallableFunction>();

  constructor() {
    this.handle = lib.tcc_new();
  }

  setLibPath(path: string) {
    lib.tcc_set_lib_path(this.handle, cstr(path));
  }

  setErrorFunc(callback: (msg: string) => void) {
    const cb = new Deno.UnsafeCallback({
      parameters: ["pointer", "pointer"],
      result: "void",
    }, (_, msg) => {
      callback(new Deno.UnsafePointerView(msg).getCString());
    });
    this.cleanups.add(() => cb.close());
    lib.tcc_set_error_func(this.handle, 0n, cb.pointer);
  }

  setOptions(options: string) {
    lib.tcc_set_options(this.handle, cstr(options));
  }

  addIncludePath(path: string) {
    return lib.tcc_add_include_path(this.handle, cstr(path));
  }

  addSysincludePath(path: string) {
    return lib.tcc_add_sysinclude_path(this.handle, cstr(path));
  }

  defineSymbol(sym: string, value: string) {
    lib.tcc_define_symbol(this.handle, cstr(sym), cstr(value));
  }

  undefineSymbol(sym: string) {
    lib.tcc_undefine_symbol(this.handle, cstr(sym));
  }

  addFile(file: string) {
    return lib.tcc_add_file(this.handle, cstr(file));
  }

  compileString(buf: string) {
    return lib.tcc_compile_string(this.handle, cstr(buf));
  }

  setOutputType(type: keyof typeof OUTPUT_TYPE) {
    return lib.tcc_set_output_type(this.handle, OUTPUT_TYPE[type]);
  }

  addLibraryPath(path: string) {
    return lib.tcc_add_library_path(this.handle, cstr(path));
  }

  addLibrary(path: string) {
    return lib.tcc_add_library(this.handle, cstr(path));
  }

  addSymbol<Fn extends Deno.ForeignFunction>(
    name: string,
    def: Fn,
    callback: Deno.UnsafeCallbackFunction<Fn["parameters"], Fn["result"]>,
  ) {
    const cb = new Deno.UnsafeCallback(def, callback);
    this.cleanups.add(() => cb.close());
    return lib.tcc_add_symbol(this.handle, cstr(name), cb.pointer);
  }

  outputFile(file: string) {
    return lib.tcc_output_file(this.handle, cstr(file));
  }

  run(args: string[]) {
    const argv = new BigUint64Array(args.length);
    const argbufs = args.map(cstr);
    argbufs.forEach((buf, i) => {
      argv[i] = Deno.UnsafePointer.of(buf);
    });
    return lib.tcc_run(this.handle, args.length, argv);
  }

  relocate(mode?: "auto" | bigint) {
    const ptr = mode === undefined ? 0n : mode === "auto" ? 1n : mode;
    return lib.tcc_relocate(this.handle, ptr);
  }

  getSymbol<Fn extends Deno.ForeignFunction>(
    name: string,
    def: Fn,
  ): Deno.DynamicLibrary<{ x: Fn }>["symbols"]["x"] | null {
    const ptr = lib.tcc_get_symbol(this.handle, cstr(name));
    if (ptr === 0n) return null;
    const fnptr = new Deno.UnsafeFnPointer(ptr, def);
    return fnptr.call.bind(fnptr) as any;
  }

  delete() {
    this.cleanups.forEach((e) => e());
    this.cleanups.clear();
    lib.tcc_delete(this.handle);
  }
}
