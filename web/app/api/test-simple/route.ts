import { NextResponse } from "next/server";

export async function GET() {
  try {
    const apiKey = process.env.NEON_API_KEY;
    const projectId = process.env.NEON_PROJECT_ID;

    console.log("Simple test - API key:", apiKey ? `${apiKey.substring(0, 10)}...` : "missing");
    console.log("Simple test - Project ID:", projectId || "missing");

    // Test 1: Simple API call to list projects (doesn't need project ID)
    console.log("Testing projects list...");
    const projectsResponse = await fetch('https://api.neon.tech/v2/projects', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      }
    });

    console.log("Projects response status:", projectsResponse.status);

    if (!projectsResponse.ok) {
      const errorText = await projectsResponse.text();
      console.log("Projects error:", errorText);
      
      return NextResponse.json({
        test: "projects_list",
        status: "error",
        message: "Failed to list projects",
        details: errorText,
        statusCode: projectsResponse.status
      });
    }

    const projectsData = await projectsResponse.json();
    console.log("Projects success:", projectsData.projects?.length || 0, "projects found");

    // Test 2: If we have projects, try to find the specific project
    if (projectId && projectsData.projects) {
      const targetProject = projectsData.projects.find((p: any) => p.id === projectId);
      
      if (!targetProject) {
        return NextResponse.json({
          test: "project_find",
          status: "error",
          message: "Project ID not found in your projects",
          yourProjectId: projectId,
          availableProjects: projectsData.projects.map((p: any) => ({ id: p.id, name: p.name }))
        });
      }

      return NextResponse.json({
        test: "project_find",
        status: "success",
        message: "Project found!",
        project: {
          id: targetProject.id,
          name: targetProject.name
        },
        allProjects: projectsData.projects.map((p: any) => ({ id: p.id, name: p.name }))
      });
    }

    return NextResponse.json({
      test: "projects_list",
      status: "success",
      message: "API key works - projects listed",
      projects: projectsData.projects.map((p: any) => ({ id: p.id, name: p.name }))
    });

  } catch (error) {
    console.error("Simple test error:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json({
      test: "basic_connection",
      status: "error",
      message: "Basic connection failed",
      error: errorMessage
    });
  }
}
