---
date: 2025-04-30
readtime: 20
categories:
  - CG tech
  - Ray tracing
authors:
  - tianle
comments: true
---

# Resources of Ray tracer and Path tracer

## Ray tracing

Here are the useful resources about ray tracing I found today:
- **CPU ray tracer using C++** (by Peter Shirley): https://raytracing.github.io/

  (I also highly recommend his ray tracing book: [Advanced Global Iluumination](https://www.amazon.com/Advanced-Global-Illumination-Philip-Dutre/dp/1568813074/ref=sr_1_1?crid=XAJB88GF62M5&dib=eyJ2IjoiMSJ9.AhqsNjaAZChvUxfoarCZVA.XxtPvOIUc8DnkfyCx4R5jaGhOe4SgWwUO-u_PznMNpU&dib_tag=se&keywords=peter+shirley+advanced+global+illumination&qid=1746076136&sprefix=peter+shirley+advanced+global+illumination%2Caps%2C138&sr=8-1), which explained the theory of tracing in math-physical formula real nice.)
- **GPU ray tracer using Vulkan**: https://github.com/grigoryoskin/vulkan-compute-ray-tracing
- **GPU ray tracer using OpenGL3.1** (back to my 2021 TAing): https://github.com/yuantianle/Ray_Tracing-Sep2021

## Path tracing

- Instead of doing `ray tracing`, we can optimize the calculation by only caring about the camera's input - we get a method named `path tracing`. Let's see how Disney explains the theory: [Disney's Hyperion Renderer](https://www.disneyanimation.com/technology/hyperion/)

- **CUDA path tracer** (by YINING KARL LI): https://www.yiningkarlli.com/projects/gpupathtracer.html
