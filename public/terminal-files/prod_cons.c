#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/mman.h>
#include <sys/wait.h>
#include <semaphore.h>

#define BUFFER_SIZE 5

typedef struct
{
    int buffer[BUFFER_SIZE];

    int in;
    int out;

    sem_t empty;
    sem_t full;
    sem_t mutex;

} shared_data;

int main()
{
    shared_data *shm = mmap(
        NULL,
        sizeof(shared_data),
        PROT_READ | PROT_WRITE,
        MAP_SHARED | MAP_ANONYMOUS,
        -1,
        0
    );

    if (shm == MAP_FAILED)
    {
        perror("mmap failed");
        exit(1);
    }

    shm->in = 0;
    shm->out = 0;

    sem_init(&shm->empty, 1, BUFFER_SIZE);
    sem_init(&shm->full, 1, 0);
    sem_init(&shm->mutex, 1, 1);

    pid_t pid = fork();

    if (pid < 0)
    {
        perror("fork failed");
        exit(1);
    }

    else if (pid == 0)
    {
        /* Consumer */

        for (int i = 0; i < 10; i++)
        {
            sem_wait(&shm->full);
            sem_wait(&shm->mutex);

            int item = shm->buffer[shm->out];

            printf("Consumer consumed: %d\n", item);

            shm->out =
                (shm->out + 1) % BUFFER_SIZE;

            sem_post(&shm->mutex);
            sem_post(&shm->empty);

            sleep(1);
        }

        exit(0);
    }

    else
    {
        /* Producer */

        for (int i = 0; i < 10; i++)
        {
            sem_wait(&shm->empty);
            sem_wait(&shm->mutex);

            shm->buffer[shm->in] = i;

            printf("Producer produced: %d\n", i);

            shm->in =
                (shm->in + 1) % BUFFER_SIZE;

            sem_post(&shm->mutex);
            sem_post(&shm->full);

            sleep(1);
        }

        wait(NULL);

        sem_destroy(&shm->empty);
        sem_destroy(&shm->full);
        sem_destroy(&shm->mutex);

        munmap(shm, sizeof(shared_data));
    }

    return 0;
}