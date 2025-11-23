# Use an official Python runtime as a parent image
FROM python:3.11-slim

# Set the working directory in the container
WORKDIR /app

# Install system dependencies (if any needed for your specific packages)
# RUN apt-get update && apt-get install -y ...

# Copy the requirements file into the container at /app
COPY requirements.txt .

# Install any needed packages specified in requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY . backend/

# Expose port 8000
EXPOSE 8000

# Run the application
# Using uvicorn to run the app. 
# We assume the app object is in backend/main.py and named 'app'
# Since we are in /app, and the code structure seems to be /app/backend/main.py
# We need to make sure python path is correct. 
# If we copy everything to /app, then we have /app/backend
# So uvicorn backend.main:app should work.
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
