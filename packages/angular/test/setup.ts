// @angular/common ships partially-compiled (the Angular Linker normally
// finishes the job at build time). Loading the JIT compiler first lets those
// declarations compile on demand under the test runner.
import "@angular/compiler";
