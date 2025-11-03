declare module '!arraybuffer-loader!.*' {
  declare const value: ArrayBuffer;
  export default value;
}

declare module '!raw-loader!.*' {
  declare const value: string;
  export default value;
}

declare module 'scratch-paint';

// Workspace 包的类型声明（这些包主要是 JavaScript，只有运行时类型）
declare module '@scratch/scratch-vm' {
  const VM: any;
  export default VM;
}

declare module '@scratch/scratch-render' {
  const Render: any;
  export default Render;
}

declare module '@scratch/scratch-svg-renderer' {
  const SVGRenderer: any;
  export default SVGRenderer;
}
