---
layout: post
title:  "The Next Generation of AWS Systems Manager"
date:   2025-02-06 10:00:00 +0100
categories: system-manager
excerpt: After watching the following re:Invent video from AWS (published on December 8, 2024), I found it insightful how AWS Systems Manager (SSM) has evolved over the years. The video featured Jon Galentine, Director of AWS Systems Manager, and Nereida Woo, Specialist Solutions Architect for Cloud Operations, discussing the transformation of Systems Manager from a basic EC2 maintenance tool to a comprehensive cloud operations solution. Here are my key takeaways from their talk.
cover: /assets/aws-services/system-manager/cover.png
---

After watching the following re:Invent video from AWS (published on December 8, 2024), I found it insightful how AWS Systems Manager (SSM) has evolved over the years. The video featured Jon Galentine, Director of AWS Systems Manager, and Nereida Woo, Specialist Solutions Architect for Cloud Operations, discussing the transformation of Systems Manager from a basic EC2 maintenance tool to a comprehensive cloud operations solution. Here are my key takeaways from their talk.

[![AWS Systems Manager](http://img.youtube.com/vi/mRPf5x35Vtc/0.jpg)](http://www.youtube.com/watch?v=mRPf5x35Vtc "AWS re:Invent 2024- Scaling IT with the next generation of AWS Systems Manager")

## **The Evolution of AWS Systems Manager**

### **Origins of Systems Manager**

AWS Systems Manager was introduced in 2015 to address EC2 maintenance challenges. Initially, it helped EC2 customers with configuration management, patching, automation, and recovery from operational issues. It started as an internal tool for the EC2 Windows team to streamline AMI patching, but as AWS saw the demand for similar capabilities among customers, they transformed it into a full-fledged service.

Originally named **EC2 Simple Systems Manager (SSM)**, it later evolved into **AWS Systems Manager**, reflecting its broader scope beyond EC2 instances.

### **Core Components of Systems Manager**

Systems Manager is built upon several essential services:

1. **Automation Service**: Enables workflow orchestration for multi-step processes like AMI creation.
2. **Run Command**: Executes scripts across multiple instances with safety features like rate control and error handling.
3. **Patch Manager**: Automates patch deployment across instances based on compliance policies.
4. **Session Manager**: Provides secure, auditable access to instances without needing SSH keys or inbound network access.

With these components, AWS has helped customers manage their cloud environments more efficiently while maintaining security and compliance.

### **Growth and Adoption**

Today, Systems Manager supports over **450 million compute nodes** and facilitates **2.5 billion automated script executions** per month. This massive scale highlights the demand for centralized management and automation in modern cloud operations.

## **The Next Generation of Systems Manager**

While the existing Systems Manager tools are powerful, AWS recognized that customers often found them complex to configure and integrate. To address this, AWS launched a new **unified experience** for Systems Manager, which simplifies these capabilities into an intuitive, out-of-the-box solution.

### **Key Enhancements in the New Systems Manager Experience**

1. **Centralized Management**: A single dashboard to monitor and manage nodes across AWS, hybrid, and multi-cloud environments.
2. **Diagnose and Remediate**: Easily identify and fix unmanaged nodes with missing dependencies like VPC endpoints or SSM agents.
3. **Automation Runbooks**: A low-code workflow editor with pre-built automation templates for tasks like patching and system upgrades.
4. **Compliance and Auditing**: Built-in security checks, logging, and compliance reporting to ensure operational integrity.

## **Key Takeaways**

1. **One-Click Setup**: The new Systems Manager experience is quick to configure and provides immediate value.
2. **Enhanced Troubleshooting**: Diagnosing and remediating issues with unmanaged nodes is now easier than ever.
3. **Automation-First Approach**: Pre-built automation runbooks streamline repetitive tasks and improve efficiency.
4. **AWS Resources for Learning**: AWS provides extensive documentation, blogs, and interactive workshops to help users maximize the benefits of Systems Manager.

## **Conclusion**

AWS Systems Manager has come a long way from being an EC2 maintenance tool to a comprehensive cloud operations platform. With its latest enhancements, AWS has made it more intuitive, automated, and scalable for customers of all sizes.

For more details, check out the [AWS Systems Manager documentation](https://aws.amazon.com/systems-manager/) or watch the full session on YouTube [here](https://www.youtube.com/watch?v=mRPf5x35Vtc).

