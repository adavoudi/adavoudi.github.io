---
layout: post
title:  "Deploying OpenSearch on AWS: A Step-by-Step Guide Using CloudFormation & AWS Console"
date:   2025-02-01 10:00:00 +0100
categories: aws opensearch
excerpt: Amazon OpenSearch (formerly Elasticsearch) is a powerful tool for searching, analyzing, and visualizing data. In this guide, I want to show how to set up an OpenSearch cluster on AWS, load sample data, and create interactive dashboards—all within the AWS Free Tier using both the AWS Console and IaC.
cover: /assets/aws-services/opensearch/cover.png
---

Amazon OpenSearch (formerly Elasticsearch) is a powerful tool for searching, analyzing, and visualizing data. In this guide, I want to show how to set up an OpenSearch cluster on AWS, load sample data, and create interactive dashboards—all within the AWS Free Tier using both the AWS Console and IaC.

### **Prerequisites**  
- An AWS account (less than 12 months old for Free Tier eligibility).  

### **Step 1: Create an OpenSearch Cluster**  

1. **Navigate to Amazon OpenSearch Service**  
   - Go to the AWS Management Console and search for “OpenSearch.”  
   - Click **Create domain** under **Managed clusters** (select “Standard create” for customization).  

2. **Configure Domain Settings**  
   - **Domain name**: Enter a name (e.g., `my-domain`).  
   - **Template**: Choose **Dev/Test** to optimize for cost.  
   - **Deployment option**: Select **Domain without standby** and **1 Availability Zone** to stay within the Free Tier.  

3. **Data Node Configuration**  
   - **Instance type**: Select **t3.small.search** (Free Tier eligible).  
   - **Nodes**: Set to **1**.  
   - **Storage**: Reduce EBS volume size to **10 GB** (Free Tier limit).  

4. **Network**  
   - For testing, enable **Public access** (not recommended for production).  

5. **Fine-grained access control**
   - Enable fine-grained access control
   - Select **Create master user**
   - Create a username (e.g., `admin`) and password for dashboard access.  

6. **Access policy**
   - Select **Only use fine-grained access control** to allow open access to the domain.

7. **Review & Create**  
   - Confirm settings and click **Create**. The cluster will take ~15 minutes to deploy.  


### **Step 2: Load Sample Data**  

1. **Access the OpenSearch Dashboard**  
   - Once the cluster is active, navigate to the **Domain** in AWS and click the **Dashboards URL** (e.g., `https://[domain-endpoint]/_dashboards`).  
   - Log in with your master user credentials.  

2. **Import Sample Flight Data**  
   - In the dashboard, click **Add sample data**.  
   - Select **Sample flight data** and click **Add data**. This populates the cluster with demo records for testing.  


### **Step 3: Explore & Visualize Data**  

1. **View Pre-Built Dashboards**  
   - Navigate to **Dashboard** > **Sample Flight Data Global Dashboard** to see pre-configured visualizations:  
     - Geographic flight routes.  
     - Ticket price trends.  
     - Flight delays by origin/destination.  

2. **Customize Visualizations**  
   - Use the **Discover** tab to filter raw data (e.g., filter flights by origin city like `Toronto` or delays using `flight_delay: true`).  
   - Create custom charts in the **Visualize** tab:  
     - Example: A bar chart showing ticket prices by destination country.  
     - Add sub-buckets to split data (e.g., flight distances grouped into ranges).  

3. **Use OpenSearch Query DSL**  
   - Access the **Dev Tools** console to run queries:  
     ```json
     GET opensearch_dashboards_sample_data_flights/_search
     {
       "query": {
         "bool": {
           "filter": [
             { "range": { "timestamp": { "gte": "2023-09-15", "lte": "2023-09-16" }}}
           ]
         }
       }
     }
     ```  

### **Step 4: Clean Up Resources**  
To avoid charges, delete your cluster:  
1. Return to the AWS OpenSearch console.  
2. Select your domain and click **Delete**.  
3. Confirm by typing the domain name.  


### **Step 5: Automate Deployment with AWS CloudFormation**  

If you prefer infrastructure-as-code (IaC) or want to replicate this setup programmatically, you can use the **CloudFormation template** below. This template automates the creation of an OpenSearch cluster with secure defaults, aligning with Free Tier eligibility.  

1. **Save the Template**  
   Copy the YAML below into a file (e.g., `opensearch.yml`):  

   ```yaml
   Parameters:
     DomainName:
       Type: String
       Description: Name of the OpenSearch domain (lowercase, hyphens, numbers).
       MinLength: 3
       MaxLength: 28
     DomainInstanceType:
       Type: String
       Default: t3.small.search
       AllowedValues: [t2.small.search, t3.small.search]
     MasterUserName:
       Type: String
       Description: Admin username for OpenSearch access.
     MasterUserPassword:
       Type: String
       Description: Admin password (at least 8 characters).
       NoEcho: true

   Resources:
     OpenSearchDomain:
       Type: AWS::OpenSearchService::Domain
       Properties:
         DomainName: !Ref DomainName
         ClusterConfig:
           InstanceType: !Ref DomainInstanceType
           InstanceCount: 1
           DedicatedMasterEnabled: false
           ZoneAwarenessEnabled: false
           WarmEnabled: false
         EBSOptions:
           EBSEnabled: true
           VolumeSize: 10
           VolumeType: gp2
         AdvancedSecurityOptions:
           Enabled: true
           InternalUserDatabaseEnabled: true
           MasterUserOptions:
             MasterUserName: !Ref MasterUserName
             MasterUserPassword: !Ref MasterUserPassword
         EncryptionAtRestOptions:
           Enabled: true
         NodeToNodeEncryptionOptions:
           Enabled: true
         AccessPolicies:
           Statement:
             - Effect: Allow
               Principal: { AWS: "*" }
               Action: "es:*"
               Resource: !Sub "arn:aws:es:${AWS::Region}:${AWS::AccountId}:domain/${DomainName}/*"

   Outputs:
     OpenSearchDomainEndpoint:
       Value: !GetAtt OpenSearchDomain.DomainEndpoint
     OpenSearchDashboardUrl:
       Value: !Sub "https://${OpenSearchDomain.DomainEndpoint}/_dashboards"
   ```

2. **Deploy via AWS CLI**  
   Run the following command (with appropriate values):  
   ```bash
   aws cloudformation create-stack \
     --stack-name my-opensearch-cluster \
     --template-body file://opensearch.yml \
     --parameters \
       ParameterKey=DomainName,ParameterValue=my-domain \
       ParameterKey=MasterUserName,ParameterValue=admin \
       ParameterKey=MasterUserPassword,ParameterValue=YourSecurePassword123!
   ```  

3. **Access the Cluster**  
   Once deployed (takes ~15 minutes), retrieve the **Dashboard URL** from the CloudFormation stack’s **Outputs** tab.  
